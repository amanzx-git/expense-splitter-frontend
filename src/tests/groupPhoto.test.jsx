import { useState } from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GroupPhotoEditor from '../features/groups/GroupPhotoEditor.jsx';
import GroupSettingsPage from '../pages/GroupSettingsPage.jsx';
import GroupPage from '../pages/GroupPage.jsx';
import DashboardPage from '../pages/DashboardPage.jsx';
import { UNAVAILABLE_MESSAGE } from '../api/errors.js';

vi.mock('../hooks/useAuth.js', () => ({ useAuth: () => ({ user: { id: 'u', username: 'aman' } }) }));
const NativeURL = URL;
const original = { id: 'g', name: 'Trip', my_role: 'member', member_count: 2, description: 'Before', photo_url: 'http://localhost/media/old.png' };
const json = (body) => new Response(JSON.stringify(body), { status: 200 });
let fetchMock, group;
beforeEach(() => {
  group = { ...original }; document.cookie = 'csrftoken=photo; path=/';
  vi.stubGlobal('URL', class extends NativeURL { static createObjectURL = vi.fn(() => 'blob:preview'); static revokeObjectURL = vi.fn(); });
  fetchMock = vi.fn(async (url, options) => {
    if (url.endsWith('/photo/')) { group.photo_url = 'http://localhost/media/groups/new.png'; return json({ group }); }
    if (url.endsWith('/groups/g/')) { if (options.method === 'PATCH') Object.assign(group, JSON.parse(options.body)); return json({ group }); }
    if (url.includes('/groups/?')) return json({ results: [group], next: null });
    if (url.includes('/invitations/?')) return json({ count: 0, results: [], next: null });
    if (url.endsWith('/balances/')) return json({ members: [], unsettled_expense_total: '0.00', blockers: ['NO_UNSETTLED_EXPENSES'], can_generate_settlement: false });
    if (url.includes('/expenses/?') || url.includes('/settlements/?')) return json({ results: [], next: null });
    throw new Error(url);
  }); vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function Editor() { const [data, setData] = useState(group); return <><h1>Group remains usable</h1><GroupPhotoEditor group={data} onSaved={setData} /></>; }
const file = () => new File(['image'], 'photo.png', { type: 'image/png' });

it('previews and cancels without saving or changing the original photo', async () => {
  render(<Editor />);
  await userEvent.upload(screen.getByLabelText('Group photo file'), file());
  expect(screen.getByAltText('Selected group photo preview')).toHaveAttribute('src', 'blob:preview');
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByAltText('Selected group photo preview')).not.toBeInTheDocument();
  expect(document.querySelector('img')).toHaveAttribute('src', original.photo_url);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
});
it('uploads multipart with CSRF, shows success and updates the saved avatar URL', async () => {
  render(<Editor />); await userEvent.upload(screen.getByLabelText('Group photo file'), file());
  await userEvent.click(screen.getByRole('button', { name: 'Save photo' }));
  expect(await screen.findByText('Group photo updated.')).toBeInTheDocument();
  expect(document.querySelector('img')).toHaveAttribute('src', 'http://localhost/media/groups/new.png');
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe('/api/v1/groups/g/photo/');
  expect(options.body).toBeInstanceOf(FormData); expect(options.body.get('photo').name).toBe('photo.png');
  expect(options.headers['X-CSRFToken']).toBe('photo'); expect(options.headers['Content-Type']).toBeUndefined();
});
it('keeps failures local, retains a retryable selection and preserves the old photo on cancel', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('offline'));
  render(<Editor />); await userEvent.upload(screen.getByLabelText('Group photo file'), file());
  await userEvent.click(screen.getByRole('button', { name: 'Save photo' }));
  expect(await screen.findByText(UNAVAILABLE_MESSAGE, { exact: false })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Group remains usable' })).toBeInTheDocument();
  expect(screen.getByAltText('Selected group photo preview')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(document.querySelector('img')).toHaveAttribute('src', original.photo_url);
});
it('rejects invalid MIME and oversized files before upload', async () => {
  render(<Editor />); const user = userEvent.setup({ applyAccept: false });
  await user.upload(screen.getByLabelText('Group photo file'), new File(['svg'], 'bad.svg', { type: 'image/svg+xml' }));
  expect(screen.getByText('Choose a JPG, PNG or WebP image.')).toBeInTheDocument();
  await user.upload(screen.getByLabelText('Group photo file'), new File([new Uint8Array(5*1024*1024+1)], 'huge.png', { type: 'image/png' }));
  expect(screen.getByText('Choose a photo up to 5 MB.')).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});
it('allows member description editing and refreshes uploaded photos through group/header/dashboard navigation', async () => {
  render(<MemoryRouter initialEntries={['/groups/g/settings']}><Routes><Route path="/groups/:groupId/settings" element={<GroupSettingsPage />} /><Route path="/groups/:groupId" element={<GroupPage />} /><Route path="/dashboard" element={<DashboardPage />} /></Routes></MemoryRouter>);
  await screen.findByRole('button', { name: 'Change group photo' });
  expect(screen.queryByLabelText('Group name')).not.toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText('Description')); await userEvent.type(screen.getByLabelText('Description'), 'Member update');
  await userEvent.click(screen.getByRole('button', { name: 'Save group' }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([, options]) => options.method === 'PATCH')).toBe(true));
  expect(JSON.parse(fetchMock.mock.calls.find(([, options]) => options.method === 'PATCH')[1].body)).toEqual({ description: 'Member update' });
  await userEvent.upload(screen.getByLabelText('Group photo file'), file()); await userEvent.click(screen.getByRole('button', { name: 'Save photo' }));
  await screen.findByText('Group photo updated.'); await userEvent.click(screen.getByRole('link', { name: 'Back to group' }));
  await screen.findByRole('heading', { name: 'Trip' });
  expect(document.querySelector('.conversation-header img')).toHaveAttribute('src', group.photo_url);
  await userEvent.click(screen.getByRole('link', { name: 'Back to groups' }));
  await screen.findByRole('link', { name: 'Trip' });
  expect(document.querySelector('.group-card img')).toHaveAttribute('src', group.photo_url);
});
