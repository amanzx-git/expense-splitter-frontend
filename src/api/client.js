import { ApiError, cancelledError, unavailableError } from './errors.js';

// Optional absolute API origin for independent hosting (for example https://api.example.com).
// EMPTY by default: paths stay relative and the Vite proxy handles development (R1.2-17).
const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
const BASE = `${API_ORIGIN}/api/v1`;
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';
export const DEFAULT_TIMEOUT_MS = 15000;
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// ---- hooks for AuthContext (the client itself never touches React) ----
let unauthorizedHandler = null; // called on a real 401
let connectionListener = null; // called with 'up' or 'down' after every request
export const setUnauthorizedHandler = (fn) => { unauthorizedHandler = fn; };
export const setConnectionListener = (fn) => { connectionListener = fn; };

export function readCookie(name) {
  const prefix = `${name}=`;
  const row = document.cookie.split('; ').find((r) => r.startsWith(prefix));
  return row ? decodeURIComponent(row.slice(prefix.length)) : '';
}

// ---- classification: the single place that decides "outage" vs "normal API error" ----
const hasContractShape = (data) =>
  data !== null && typeof data === 'object' && typeof data.code === 'string';

export function classifyHttpFailure(status, data) {
  // Gateway statuses are outages whatever the body says.
  if (status === 502 || status === 503 || status === 504) return unavailableError('gateway', status);
  // Any other 5xx that is not Django's JSON error shape came from a proxy or host
  // (the Vite dev proxy answers an empty 500 when Django is down).
  if (status >= 500 && !hasContractShape(data)) return unavailableError('gateway', status);
  return new ApiError({
    status,
    code: data?.code ?? 'UNKNOWN_ERROR',
    message:
      data?.message ??
      (status >= 500 ? 'Something went wrong on our side. Please try again.' : 'Something went wrong. Please try again.'),
    fields: data?.fields,
    kind: status >= 500 ? 'server' : 'api',
  });
}

async function realRequest(path, { method, body, signal, timeoutMs }) {
  const headers = { Accept: 'application/json' };
  let payload;
  if (body instanceof FormData) {
    payload = body; // never set Content-Type: the browser adds the multipart boundary
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (UNSAFE.has(method)) headers['X-CSRFToken'] = readCookie('csrftoken');

  // Our own controller lets us tell "we gave up" (timeout) from "the caller cancelled".
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const forwardCancel = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', forwardCancel, { once: true });
  }
  const failure = (err) => {
    if (timedOut) return unavailableError('timeout');
    if (controller.signal.aborted || err?.name === 'AbortError') return cancelledError();
    return unavailableError('network');
  };

  try {
    let response;
    try {
      response = await fetch(`${BASE}${path}`, {
        method, headers, body: payload, credentials: 'include', signal: controller.signal,
      });
    } catch (err) {
      throw failure(err);
    }
    if (controller.signal.aborted) throw failure();
    if (response.status === 204) return null;

    let data = null;
    // Django's development exception response is plain text for JSON requests.
    // Recognize that application failure without exposing its traceback or
    // confusing it with Vite's empty 500 when its backend is unreachable.
    const djangoDebug = response.status === 500 && response.headers.get('Content-Type')?.startsWith('text/plain') ? response.clone() : null;
    try {
      data = await response.json();
    } catch (err) {
      if (controller.signal.aborted) throw failure(err); // timed out or cancelled while reading
      /* otherwise: the body was not JSON (for example an HTML error page) */
      if (djangoDebug) {
        const text = await djangoDebug.text();
        if (/^[A-Za-z_][\w.]*(?:Error|Exception) at \/api\//.test(text)) data = { code: 'API_ERROR', message: 'Something went wrong on our side. Please try again.' };
      }
    }
    if (controller.signal.aborted) throw failure();
    if (response.ok) {
      if (data === null) throw unavailableError('bad_response', response.status);
      return data;
    }
    throw classifyHttpFailure(response.status, data);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardCancel);
  }
}

async function callMock(method, path, body) {
  const { mockRequest } = await import('./mock.js'); // loaded only in mock mode
  return mockRequest(method, path, body);
}

// NOTE: nothing here retries a request automatically, except ONE repeat after CSRF_FAILED.
// That is safe for every method: Django rejected the request before processing it.
async function send(path, options = {}, isRetry = false) {
  const { method = 'GET', body, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  try {
    if (UNSAFE.has(method)) await ensureCsrf();
    const data = USE_MOCKS
      ? await callMock(method, path, body)
      : await realRequest(path, { method, body, signal, timeoutMs });
    connectionListener?.('up');
    if (UNSAFE.has(method) && path.startsWith('/messages/')) window.dispatchEvent(new Event('splitter:messages-changed'));
    if (UNSAFE.has(method) && /^\/(groups|invitations|expenses|transactions)\//.test(path)) {
      window.dispatchEvent(new Event('splitter:notifications-changed'));
    }
    return data;
  } catch (error) {
    // Cancellation (or a programming error): no state changes, nothing reported.
    if (!(error instanceof ApiError)) throw error;
    connectionListener?.(error.unavailable ? 'down' : 'up'); // any HTTP answer means the server is up
    if (error.code === 'CSRF_FAILED' && !isRetry) {
      await ensureCsrf(true);
      return send(path, options, true);
    }
    if (error.status === 401 && !error.unavailable) unauthorizedHandler?.();
    throw error;
  }
}

// Make sure the csrftoken cookie exists before an unsafe request.
let csrfInFlight = null;
export async function ensureCsrf(force = false) {
  if (!force && readCookie('csrftoken')) return;
  if (!csrfInFlight) {
    csrfInFlight = send('/auth/csrf/', { method: 'GET' }).finally(() => { csrfInFlight = null; });
  }
  await csrfInFlight;
}

// options: { signal, timeoutMs }
export const api = {
  get: (path, options) => send(path, { ...options, method: 'GET' }),
  post: (path, body, options) => send(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => send(path, { ...options, method: 'PATCH', body }),
  del: (path, options) => send(path, { ...options, method: 'DELETE' }),
};
