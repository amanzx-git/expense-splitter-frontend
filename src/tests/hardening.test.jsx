import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { api, setConnectionListener, setUnauthorizedHandler } from '../api/client.js';
import { AuthProvider } from '../context/AuthContext.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { safeNext } from '../utils/safeNext.js';
import Modal from '../components/Modal.jsx';
import VerifyEmailPage from '../pages/VerifyEmailPage.jsx';

const USER = { id: '123e4567-e89b-42d3-a456-426614174001', username: 'aman', full_name: 'Aman', email_verified: true };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => { document.cookie = 'csrftoken=harden; path=/'; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setConnectionListener(null); setUnauthorizedHandler(null); });
it('ignores a cancelled stale 401 even when response parsing finishes later', async () => {
  let finish;
  vi.stubGlobal('fetch', vi.fn(async () => ({ status: 401, ok: false, json: () => new Promise((resolve) => { finish = resolve; }) })));
  const unauthorized = vi.fn(); setUnauthorizedHandler(unauthorized);
  const controller = new AbortController();
  const pending = api.get('/users/me/', { signal: controller.signal }).catch((err) => err);
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  controller.abort(); finish({ code: 'AUTHENTICATION_REQUIRED', message: 'Old session.' });
  expect((await pending).name).toBe('AbortError'); expect(unauthorized).not.toHaveBeenCalled();
});
it('shares simultaneous CSRF initialization without duplicating unsafe writes', async () => {
  document.cookie = 'csrftoken=; path=/; max-age=0';
  let release;
  const fetchMock = vi.fn(async (url) => {
    if (url.endsWith('/auth/csrf/')) { await new Promise((resolve) => { release = resolve; }); document.cookie = 'csrftoken=fresh; path=/'; }
    return json({ ok: true });
  }); vi.stubGlobal('fetch', fetchMock);
  const writes = [api.post('/groups/', { name: 'One' }), api.post('/groups/', { name: 'Two' })];
  await waitFor(() => expect(release).toBeTypeOf('function')); release(); await Promise.all(writes);
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/csrf/'))).toHaveLength(1);
  expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(2);
});
function SessionHarness() {
  const auth = useAuth();
  return <><output>{auth.status}:{auth.user?.id}</output><button onClick={() => auth.login('aman@example.com', 'password')}>Login</button><button onClick={auth.logout}>Logout</button><button onClick={auth.recheck}>Recheck</button></>;
}
it('a pending startup check cannot undo a successful login', async () => {
  let finish;
  vi.stubGlobal('fetch', vi.fn(async (url) => url.endsWith('/users/me/') ? new Promise((resolve) => { finish = resolve; }) : json({ user: USER })));
  render(<AuthProvider><SessionHarness /></AuthProvider>);
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  await userEvent.click(screen.getByRole('button', { name: 'Login' }));
  expect(await screen.findByText(`authenticated:${USER.id}`)).toBeInTheDocument();
  await act(async () => finish(json({ code: 'AUTHENTICATION_REQUIRED', message: 'Old response' }, 401)));
  expect(screen.getByText(`authenticated:${USER.id}`)).toBeInTheDocument();
});
it('a pending session refresh cannot resurrect a logged-out user', async () => {
  let finish, calls = 0;
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (url.endsWith('/users/me/')) { if (calls++ === 0) return json({ user: USER }); return new Promise((resolve) => { finish = resolve; }); }
    return new Response(null, { status: 204 });
  }));
  render(<AuthProvider><SessionHarness /></AuthProvider>);
  await screen.findByText(`authenticated:${USER.id}`);
  await userEvent.click(screen.getByRole('button', { name: 'Recheck' }));
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  await userEvent.click(screen.getByRole('button', { name: 'Logout' }));
  await screen.findByText('anonymous:');
  await act(async () => finish(json({ user: USER })));
  expect(screen.getByText('anonymous:')).toBeInTheDocument();
});
it('blocks control-character redirect targets', () => {
  for (const path of ['/\n/evil.example', '/\t/evil.example', '/dashboard\u0000', '//evil.example']) expect(safeNext(path)).toBeNull();
  expect(safeNext('/groups/one?expense=two')).toBe('/groups/one?expense=two');
});
function DialogHarness({ busy }) {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>Open dialog</button><Modal open={open} busy={busy} title="Confirm action" onClose={() => setOpen(false)}><button onClick={() => setOpen(false)}>Close dialog</button></Modal></>;
}
it('keeps busy dialogs open on Escape and restores focus after closing', async () => {
  const view = render(<DialogHarness busy />);
  const opener = screen.getByRole('button', { name: 'Open dialog' });
  await userEvent.click(opener);
  expect(screen.getByRole('button', { name: 'Close confirm action' })).toBeDisabled();
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  view.rerender(<DialogHarness busy={false} />);
  await userEvent.click(screen.getByRole('button', { name: 'Close confirm action' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(opener).toHaveFocus();
  await userEvent.click(opener);
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(opener).toHaveFocus();
});
it('verifies a changed token once and ignores the previous token response', async () => {
  let finishOld;
  const fetchMock = vi.fn(async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.token === 'old') return new Promise((resolve) => { finishOld = resolve; });
    return json({ message: 'Verified' });
  }); vi.stubGlobal('fetch', fetchMock);
  render(<MemoryRouter initialEntries={['/verify-email?uid=user&token=old']}><Link to="/verify-email?uid=user&token=new">New link</Link><Routes><Route path="/verify-email" element={<VerifyEmailPage />} /></Routes></MemoryRouter>);
  await waitFor(() => expect(finishOld).toBeTypeOf('function'));
  await userEvent.click(screen.getByRole('link', { name: 'New link' }));
  expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeInTheDocument();
  await act(async () => finishOld(json({ code: 'INVALID_VERIFICATION_TOKEN', message: 'Old link invalid' }, 400)));
  expect(screen.getByRole('heading', { name: 'Email verified' })).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
