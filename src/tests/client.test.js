import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  api, classifyHttpFailure, DEFAULT_TIMEOUT_MS, setConnectionListener, setUnauthorizedHandler,
} from '../api/client.js';
import { ApiError, UNAVAILABLE_MESSAGE, isCancelled } from '../api/errors.js';

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const html = (status) =>
  new Response('<html>oops</html>', { status, headers: { 'Content-Type': 'text/html' } });
const clearCsrf = () => { document.cookie = 'csrftoken=; path=/; max-age=0'; };
const setCsrf = (v) => { document.cookie = `csrftoken=${v}; path=/`; };

// A fetch that never answers but, like the real one, rejects when its signal aborts.
const hangingFetch = (_url, { signal }) =>
  new Promise((_resolve, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort);
  });

let fetchMock;
let listener;
let unauthorized;
beforeEach(() => {
  clearCsrf();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  listener = vi.fn();
  unauthorized = vi.fn();
  setConnectionListener(listener);
  setUnauthorizedHandler(unauthorized);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setConnectionListener(null);
  setUnauthorizedHandler(null);
  clearCsrf();
});

describe('request basics', () => {
  it('sends cookies on GET, with no CSRF header and no Content-Type', async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    await api.get('/users/me/');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/users/me/');
    expect(options.credentials).toBe('include');
    expect(options.headers['X-CSRFToken']).toBeUndefined();
    expect(options.headers['Content-Type']).toBeUndefined();
  });

  it('sends the CSRF header and JSON on POST', async () => {
    setCsrf('abc123');
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    await api.post('/auth/login/', { email: 'a@b.co', password: 'x' });
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers['X-CSRFToken']).toBe('abc123');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.body).toBe(JSON.stringify({ email: 'a@b.co', password: 'x' }));
  });

  it('fetches the CSRF cookie first when it is missing', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url.endsWith('/auth/csrf/')) {
        setCsrf('fresh');
        return json(200, { message: 'CSRF cookie set' });
      }
      return json(200, { ok: true });
    });
    await api.post('/auth/logout/', {});
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/auth/csrf/');
    expect(fetchMock.mock.calls[1][1].headers['X-CSRFToken']).toBe('fresh');
  });

  it('does not set Content-Type for FormData', async () => {
    setCsrf('abc123');
    fetchMock.mockResolvedValue(json(200, { profile_photo_url: null }));
    const form = new FormData();
    form.append('photo', new Blob(['x']), 'a.png');
    await api.post('/users/me/photo/', form);
    const [, options] = fetchMock.mock.calls[0];
    expect(options.body).toBe(form);
    expect(options.headers['Content-Type']).toBeUndefined();
  });

  it('returns null for 204', async () => {
    setCsrf('abc123');
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.post('/auth/logout/', {})).resolves.toBeNull();
  });

  it('refreshes the CSRF cookie and retries once on CSRF_FAILED', async () => {
    setCsrf('old');
    const queue = [
      () => json(403, { code: 'CSRF_FAILED', message: 'CSRF failed.' }),
      () => { setCsrf('new'); return json(200, { message: 'CSRF cookie set' }); },
      () => json(200, { done: true }),
    ];
    fetchMock.mockImplementation(async () => queue.shift()());
    await expect(api.post('/groups/', { name: 'Goa' })).resolves.toEqual({ done: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1].headers['X-CSRFToken']).toBe('new');
  });

  it('never repeats a CSRF_FAILED request more than once', async () => {
    setCsrf('old');
    const queue = [
      () => json(403, { code: 'CSRF_FAILED', message: 'CSRF failed.' }),
      () => json(200, { message: 'CSRF cookie set' }),
      () => json(403, { code: 'CSRF_FAILED', message: 'CSRF failed.' }),
    ];
    fetchMock.mockImplementation(async () => queue.shift()());
    await expect(api.post('/groups/', {})).rejects.toMatchObject({ code: 'CSRF_FAILED' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('telling outages apart from normal errors', () => {
  it.each([502, 503, 504])('treats %i as an outage, whatever the body says', async (status) => {
    fetchMock.mockResolvedValue(json(status, { code: 'SOMETHING', message: 'from a proxy' }));
    await expect(api.get('/x/')).rejects.toMatchObject({
      unavailable: true, kind: 'gateway', status, code: 'SERVER_UNAVAILABLE', message: UNAVAILABLE_MESSAGE,
    });
  });

  it('treats an empty 500 (what the Vite proxy sends when Django is down) as an outage', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    await expect(api.get('/x/')).rejects.toMatchObject({ unavailable: true, kind: 'gateway', status: 500 });
  });

  it('treats an HTML 500 page as an outage', async () => {
    fetchMock.mockResolvedValue(html(500));
    await expect(api.get('/x/')).rejects.toMatchObject({ unavailable: true, message: UNAVAILABLE_MESSAGE });
  });

  it('does not treat a real Django 500 (contract JSON) as an outage', async () => {
    fetchMock.mockResolvedValue(json(500, { code: 'INTERNAL_ERROR', message: 'Boom.' }));
    await expect(api.get('/x/')).rejects.toMatchObject({
      unavailable: false, kind: 'server', code: 'INTERNAL_ERROR', message: 'Boom.',
    });
  });
  it('keeps a Django debug exception local to the failing API without exposing the traceback', async () => {
    fetchMock.mockResolvedValue(new Response('ProgrammingError at /api/v1/groups/g/comments/\ncolumn groups_comment.client_request_id does not exist', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
    await expect(api.get('/groups/g/comments/')).rejects.toMatchObject({ status: 500, code: 'API_ERROR', kind: 'server', unavailable: false, message: 'Something went wrong on our side. Please try again.' });
    expect(listener).toHaveBeenCalledWith('up');
    expect(unauthorized).not.toHaveBeenCalled();
  });

  it('treats a refused or offline connection as an outage', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.get('/x/')).rejects.toMatchObject({
      unavailable: true, kind: 'network', status: 0, code: 'SERVER_UNAVAILABLE', message: UNAVAILABLE_MESSAGE,
    });
  });

  it('treats a 200 that is not JSON (a static host answering for /api) as an outage', async () => {
    fetchMock.mockResolvedValue(html(200));
    await expect(api.get('/x/')).rejects.toMatchObject({ unavailable: true, kind: 'bad_response' });
  });

  it.each([
    [400, 'VALIDATION_ERROR'],
    [401, 'AUTHENTICATION_REQUIRED'],
    [403, 'EMAIL_NOT_VERIFIED'],
    [403, 'PERMISSION_DENIED'],
    [404, 'NOT_FOUND'],
    [409, 'PENDING_INVITATIONS'],
    [429, 'RATE_LIMITED'],
  ])('keeps %i %s as a normal API error, not an outage', async (status, code) => {
    fetchMock.mockResolvedValue(json(status, { code, message: 'Server says no.' }));
    const err = await api.get('/x/').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ unavailable: false, kind: 'api', status, code, message: 'Server says no.' });
  });

  it('survives a non-JSON 404 page without calling it an outage', async () => {
    fetchMock.mockResolvedValue(html(404));
    await expect(api.get('/x/')).rejects.toMatchObject({ unavailable: false, code: 'UNKNOWN_ERROR', status: 404 });
  });

  it('keeps field errors, including unexpected keys', async () => {
    fetchMock.mockResolvedValue(
      json(400, { code: 'VALIDATION_ERROR', message: 'Fix it.', fields: { a: ['x'], surprise: ['y'] } })
    );
    await expect(api.get('/x/')).rejects.toMatchObject({ fields: { a: ['x'], surprise: ['y'] } });
  });

  it('classifyHttpFailure works directly', () => {
    expect(classifyHttpFailure(503, null).unavailable).toBe(true);
    expect(classifyHttpFailure(418, { code: 'TEAPOT', message: 'm' }).unavailable).toBe(false);
  });
});

describe('401 handling', () => {
  it('calls the unauthorized handler on a real 401', async () => {
    fetchMock.mockResolvedValue(json(401, { code: 'AUTHENTICATION_REQUIRED', message: 'Sign in.' }));
    await expect(api.get('/users/me/')).rejects.toMatchObject({ status: 401 });
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });

  it('never signs anyone out because of an outage or a cancellation', async () => {
    fetchMock.mockResolvedValue(json(503, { code: 'X', message: 'x' }));
    await api.get('/a/').catch(() => {});
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await api.get('/b/').catch(() => {});
    fetchMock.mockImplementation(hangingFetch);
    const controller = new AbortController();
    const pending = api.get('/c/', { signal: controller.signal }).catch(() => {});
    controller.abort();
    await pending;
    expect(unauthorized).not.toHaveBeenCalled();
  });
});

describe('connection reporting', () => {
  it('reports up after a success and after any HTTP answer, even an error', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    await api.get('/a/');
    fetchMock.mockResolvedValueOnce(json(400, { code: 'VALIDATION_ERROR', message: 'm' }));
    await api.get('/b/').catch(() => {});
    expect(listener.mock.calls).toEqual([['up'], ['up']]);
  });

  it('reports down for a network failure, a gateway error and a timeout', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await api.get('/a/').catch(() => {});
    fetchMock.mockResolvedValueOnce(json(503, { code: 'X', message: 'x' }));
    await api.get('/b/').catch(() => {});
    fetchMock.mockImplementationOnce(hangingFetch);
    await api.get('/c/', { timeoutMs: 20 }).catch(() => {});
    expect(listener.mock.calls).toEqual([['down'], ['down'], ['down']]);
  });

  it('reports nothing when a request is cancelled', async () => {
    fetchMock.mockImplementation(hangingFetch);
    const controller = new AbortController();
    const pending = api.get('/a/', { signal: controller.signal }).catch(() => {});
    controller.abort();
    await pending;
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('timeouts and cancellation', () => {
  it('uses a 15 second timeout by default', async () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(15000);
    const spy = vi.spyOn(globalThis, 'setTimeout');
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    await api.get('/x/');
    expect(spy).toHaveBeenCalledWith(expect.any(Function), 15000);
  });

  it('gives up after the timeout and calls it an outage with an unknown outcome', async () => {
    fetchMock.mockImplementation(hangingFetch);
    await expect(api.get('/slow/', { timeoutMs: 30 })).rejects.toMatchObject({
      unavailable: true, kind: 'timeout', outcomeUnknown: true, message: UNAVAILABLE_MESSAGE,
    });
  });

  it('clears its timer once a request finishes', async () => {
    const spy = vi.spyOn(globalThis, 'clearTimeout');
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    await api.get('/x/');
    expect(spy).toHaveBeenCalled();
  });

  it('treats a caller cancel as a cancellation, not an ApiError', async () => {
    fetchMock.mockImplementation(hangingFetch);
    const controller = new AbortController();
    const pending = api.get('/x/', { signal: controller.signal });
    controller.abort();
    const err = await pending.catch((e) => e);
    expect(isCancelled(err)).toBe(true);
    expect(err).not.toBeInstanceOf(ApiError);
  });

  it('treats an already-cancelled signal as a cancellation straight away', async () => {
    fetchMock.mockImplementation(hangingFetch);
    const controller = new AbortController();
    controller.abort();
    const err = await api.get('/x/', { signal: controller.signal }).catch((e) => e);
    expect(isCancelled(err)).toBe(true);
  });

  it('does not report a timeout after the caller cancelled', async () => {
    fetchMock.mockImplementation(hangingFetch);
    const controller = new AbortController();
    const pending = api.get('/x/', { signal: controller.signal, timeoutMs: 20 }).catch(() => {});
    controller.abort();
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 60)); // longer than the timeout
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('no automatic retries', () => {
  it('does not repeat a GET after a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await api.get('/x/').catch(() => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not repeat a POST after a network failure, a gateway error or a timeout', async () => {
    setCsrf('abc');
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await api.post('/groups/', { name: 'Goa' }).catch(() => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(json(503, { code: 'X', message: 'x' }));
    await api.post('/groups/', { name: 'Goa' }).catch(() => {});
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockImplementationOnce(hangingFetch);
    await api.post('/groups/', { name: 'Goa' }, { timeoutMs: 20 }).catch(() => {});
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
