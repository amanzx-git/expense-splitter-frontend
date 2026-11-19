import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import { useAuth } from '../hooks/useAuth.js';
import * as authApi from '../api/auth.js';
import ProfilePage from '../pages/ProfilePage.jsx';

vi.mock('../api/auth.js');
const A = { id: 'a', username: 'aman', full_name: 'Aman', email: 'a@example.com', email_verified: true, upi_id: '', profile_photo_url: null };
const B = { ...A, id: 'b', username: 'bob', full_name: 'Bob' };
let auth;
function Harness() { auth = useAuth(); return <><output>{auth.status}:{auth.user?.full_name}</output><Link to="/profile">Profile</Link><Link to="/other">Other</Link><Routes><Route path="/profile" element={<ProfilePage />} /><Route path="/other" element={<p>Other page</p>} /></Routes></>; }
function open() { render(<MemoryRouter initialEntries={['/profile']}><AuthProvider><Harness /></AuthProvider></MemoryRouter>); }
beforeEach(() => { vi.resetAllMocks(); authApi.getMe.mockResolvedValue({ user: A }); authApi.login.mockResolvedValue({ user: B }); authApi.logout.mockResolvedValue(); });
afterEach(cleanup);
it('reuses one in-memory profile on ordinary navigation without browser storage', async () => {
  const store = vi.spyOn(Storage.prototype, 'setItem');
  open(); await screen.findByLabelText('Full name');
  await userEvent.click(screen.getByRole('link', { name: 'Other' }));
  await userEvent.click(screen.getByRole('link', { name: 'Profile' }));
  expect(screen.getByLabelText('Full name')).toHaveValue('Aman');
  expect(authApi.getMe).toHaveBeenCalledTimes(1); expect(store).not.toHaveBeenCalled(); store.mockRestore();
});
it('deduplicates concurrent checks, but explicit Retry after completion is fresh', async () => {
  let finish; authApi.getMe.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  open(); await waitFor(() => expect(finish).toBeTypeOf('function'));
  let first, second;
  act(() => { first = auth.recheck(); second = auth.recheck(); });
  expect(first).toBe(second); expect(authApi.getMe).toHaveBeenCalledTimes(1);
  await act(async () => { finish({ user: A }); await first; });
  await act(async () => { await auth.recheck(); });
  expect(authApi.getMe).toHaveBeenCalledTimes(2);
});
it('invalidates pending checks on profile/photo updates and ignores stale account updates', async () => {
  open(); await screen.findByLabelText('Full name');
  let finish; authApi.getMe.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  let pending; act(() => { pending = auth.recheck(); });
  act(() => auth.updateUser({ ...A, full_name: 'Saved', profile_photo_url: 'https://example.com/new.png' }));
  await act(async () => { finish({ user: A }); await pending; });
  expect(auth.user.full_name).toBe('Saved'); expect(auth.user.profile_photo_url).toContain('new.png');
  await act(async () => { await auth.login('b@example.com', 'password'); });
  expect(screen.getByLabelText('Full name')).toHaveValue('Bob');
  act(() => auth.updateUser(A)); expect(auth.user.id).toBe('b');
  await act(async () => { await auth.logout(); });
  expect(auth.user).toBeNull(); expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
});
it('retains the authenticated in-memory profile during outage checks', async () => {
  open(); await screen.findByLabelText('Full name');
  authApi.getMe.mockRejectedValueOnce(new TypeError('offline'));
  await act(async () => { await auth.recheck(); });
  expect(auth.status).toBe('authenticated'); expect(auth.user.id).toBe('a');
});
