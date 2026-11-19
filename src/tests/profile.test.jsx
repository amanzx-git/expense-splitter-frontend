import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfilePage from '../pages/ProfilePage.jsx';
import { safeProfilePhotoUrl } from '../utils/profile.js';
import { UNAVAILABLE_MESSAGE } from '../api/errors.js';
import { AuthProvider } from '../context/AuthContext.jsx';
import { useAuth } from '../hooks/useAuth.js';

let auth;
function Harness() { auth = useAuth(); return <ProfilePage />; }
function openProfile() { return render(<AuthProvider><Harness /></AuthProvider>); }
let profile, requests, handler;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => {
  requests = []; handler = null;
  document.cookie = 'csrftoken=r0; path=/';
  profile = { id: '123e4567-e89b-42d3-a456-426614174001', username: 'aman', full_name: 'Aman', email: 'aman@example.com', email_verified: true, upi_id: 'aman@bank', profile_photo_url: null };
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    requests.push({ url, options });
    const result = handler?.(url, options); if (result) return result;
    if (options.method === 'PATCH') Object.assign(profile, JSON.parse(options.body));
    if (url.endsWith('/photo/')) return json({ profile_photo_url: 'http://localhost:8000/media/profiles/photo.png' });
    return json({ user: profile });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('loads own profile, immutable email and verification status with optional photo fallback', async () => {
  openProfile();
  expect(await screen.findByLabelText('Full name')).toHaveValue('Aman');
  expect(screen.getByText('Email: aman@example.com')).toBeInTheDocument();
  expect(screen.getByText('Email verification: Verified')).toBeInTheDocument();
  expect(screen.getByText('No profile photo')).toBeInTheDocument();
  expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
});
it('normalizes and saves only contract fields, clears UPI and updates auth metadata', async () => {
  openProfile(); const input = await screen.findByLabelText('Username');
  await userEvent.clear(input); await userEvent.type(input, ' Aman_New ');
  await userEvent.clear(screen.getByLabelText('Full name')); await userEvent.type(screen.getByLabelText('Full name'), ' Aman Updated ');
  await userEvent.clear(screen.getByLabelText('UPI ID (optional)'));
  await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
  const request = requests.find((r) => r.options.method === 'PATCH');
  expect(JSON.parse(request.options.body)).toEqual({ username: 'aman_new', full_name: 'Aman Updated', upi_id: '' });
  expect(request.options.headers['X-CSRFToken']).toBe('r0');
  expect(auth.user).toEqual(expect.objectContaining({ username: 'aman_new', full_name: 'Aman Updated' }));
});
it('rejects invalid profile input without sending a mutation', async () => {
  openProfile(); const input = await screen.findByLabelText('Username');
  await userEvent.clear(input); await userEvent.type(input, 'bad name');
  await userEvent.clear(screen.getByLabelText('Full name'));
  await userEvent.type(screen.getByLabelText('UPI ID (optional)'), ' invalid');
  await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  expect(screen.getByText(/Enter a full name/)).toBeInTheDocument();
  expect(requests.some((r) => r.options.method === 'PATCH')).toBe(false);
});
it('preserves server field errors and unexpected details', async () => {
  handler = (url, options) => options.method === 'PATCH' ? json({ code: 'VALIDATION_ERROR', message: 'Please correct the highlighted fields.', fields: { username: ['Already taken'], extra: ['Keep this detail'] } }, 400) : null;
  openProfile(); await screen.findByLabelText('Username');
  await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  expect(await screen.findByText('Error: Already taken')).toBeInTheDocument();
  expect(screen.getByText('extra: Keep this detail')).toBeInTheDocument();
});
it('uploads multipart photo with CSRF and no explicit Content-Type', async () => {
  openProfile(); const input = await screen.findByLabelText('Choose profile photo');
  await userEvent.upload(input, new File(['png'], 'photo.png', { type: 'image/png' }));
  await userEvent.click(screen.getByRole('button', { name: 'Upload photo' }));
  expect(await screen.findByText('Profile photo uploaded.')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Your profile photo' })).toHaveAttribute('src', 'http://localhost:8000/media/profiles/photo.png');
  const request = requests.find((r) => r.url.endsWith('/photo/'));
  expect(request.options.body).toBeInstanceOf(FormData);
  expect(request.options.body.get('photo').name).toBe('photo.png');
  expect(request.options.headers['Content-Type']).toBeUndefined();
  expect(request.options.headers['X-CSRFToken']).toBe('r0');
  expect(input).toHaveValue('');
});
it('blocks invalid file types, oversized images and unsafe returned image URLs', async () => {
  openProfile(); const input = await screen.findByLabelText('Choose profile photo');
  const user = userEvent.setup({ applyAccept: false });
  await user.upload(input, new File(['html'], 'photo.html', { type: 'text/html' }));
  await user.click(screen.getByRole('button', { name: 'Upload photo' }));
  expect(screen.getByText(/Choose a JPG, PNG or WebP/)).toBeInTheDocument();
  await user.upload(input, new File([new Uint8Array(2*1024*1024+1)], 'big.png', { type: 'image/png' }));
  await user.click(screen.getByRole('button', { name: 'Upload photo' }));
  expect(screen.getByText(/Choose a photo up to 2 MB/)).toBeInTheDocument();
  expect(requests.some((r) => r.url.endsWith('/photo/'))).toBe(false);
  for (const url of ['javascript:alert(1)', 'data:image/png;base64,abc', '/media/photo.png', 'https://user:pass@example.com/photo.png']) expect(safeProfilePhotoUrl(url)).toBeNull();
  expect(safeProfilePhotoUrl('https://example.com/photo.png')).toBe('https://example.com/photo.png');
});
it('shows profile load outages with Retry and preserves form entries on failed save', async () => {
  let down = true;
  handler = () => { if (down) throw new TypeError('offline'); };
  openProfile();
  expect(await screen.findByText(UNAVAILABLE_MESSAGE, { exact: false })).toBeInTheDocument();
  down = false; await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  const input = await screen.findByLabelText('Full name'); await userEvent.clear(input); await userEvent.type(input, 'Keep my edit');
  down = true; await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  expect(await screen.findByText(UNAVAILABLE_MESSAGE, { exact: false })).toBeInTheDocument(); expect(input).toHaveValue('Keep my edit');
});
it('blocks duplicate profile submissions while saving', async () => {
  let finish;
  handler = (url, options) => options.method === 'PATCH' ? new Promise((resolve) => { finish = resolve; }) : null;
  openProfile(); await screen.findByLabelText('Full name');
  await userEvent.dblClick(screen.getByRole('button', { name: 'Save profile' }));
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  expect(requests.filter((r) => r.options.method === 'PATCH')).toHaveLength(1);
  finish(json({ user: profile }));
  expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
});
