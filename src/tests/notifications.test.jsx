import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import NotificationsProvider from '../features/notifications/NotificationsProvider.jsx';
import NotificationBell from '../features/notifications/NotificationBell.jsx';
import Header from '../components/Header.jsx';
import NotificationsPage from '../pages/NotificationsPage.jsx';
import { notificationTarget, EVENT_LABELS } from '../features/notifications/navigation.js';
import { api } from '../api/client.js';
import { UNAVAILABLE_MESSAGE } from '../api/errors.js';

let auth;
vi.mock('../hooks/useAuth.js', () => ({ useAuth: () => auth }));
const uid = '123e4567-e89b-42d3-a456-426614174001';
const gid = '123e4567-e89b-42d3-a456-426614174002';
const rid = '123e4567-e89b-42d3-a456-426614174003';
let notes, count, requests, handler;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const page = (results, total = results.length, next = null, previous = null) => ({ results, count: total, next, previous });
beforeEach(() => {
  auth = { status: 'authenticated', user: { id: uid, email_verified: true } };
  document.cookie = 'csrftoken=f9; path=/';
  notes = [{ id: uid, type: 'payment_reported', message: 'A payer reported payment.', is_read: false, created_at: '2026-11-13T10:00:00Z', group_id: gid, related_type: 'settlement', related_id: rid }];
  count = 25; requests = []; handler = null;
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    const path = url.replace('/api/v1', '');
    requests.push({ path, options });
    const custom = handler?.(path, options.method);
    if (custom) return custom;
    if (path === '/notifications/unread-count/') return json({ unread_count: count });
    if (path.startsWith('/notifications/?')) return json(page(notes));
    if (path.endsWith('/read/')) { notes[0].is_read = true; count -= 1; return json({ notification: notes[0] }); }
    if (path.startsWith('/settlements/')) return json({ settlement: { group_id: gid } });
    if (path.startsWith('/expenses/')) return json({ expense: { group_id: gid } });
    if (path.startsWith('/groups/')) return json({ group: { id: gid } });
    throw new Error('Unexpected request '+path);
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function Location() { return <output aria-label="Location">{useLocation().pathname+useLocation().search}</output>; }
function App() {
  return <MemoryRouter initialEntries={['/notifications']}><NotificationsProvider>
    {auth.status === 'authenticated' && <NotificationBell />}
    <Routes><Route path="/notifications" element={<NotificationsPage />} /><Route path="*" element={<h1>Destination</h1>} /></Routes>
    <Location />
  </NotificationsProvider></MemoryRouter>;
}
it('shows server global unread count instead of page length and read/unread distinction', async () => {
  render(<App />);
  expect(await screen.findByRole('link', { name: 'Notifications, 25 unread' })).toBeInTheDocument();
  expect(document.querySelector('.notification-badge')).toHaveTextContent('9+');
  expect(await screen.findByText('Unread')).toBeInTheDocument();
  expect(screen.getByText('Payment marked as paid')).toBeInTheDocument();
  expect(requests.filter((r) => r.path === '/notifications/unread-count/')).toHaveLength(1);
  expect(requests.filter((r) => r.path.startsWith('/notifications/?'))).toHaveLength(1);
});
it('keeps a single bell directly beside the menu and opens notifications without opening navigation', async () => {
  render(<MemoryRouter><NotificationsProvider><Header /><Location /></NotificationsProvider></MemoryRouter>);
  const bell = await screen.findByRole('link', { name: 'Notifications, 25 unread' });
  const menu = screen.getByRole('button', { name: 'Open navigation' });
  expect(bell.closest('.notification-bell').nextElementSibling).toBe(menu);
  expect(document.querySelectorAll('.notification-bell')).toHaveLength(1);
  await userEvent.click(bell);
  expect(screen.getByLabelText('Location')).toHaveTextContent('/notifications');
  expect(menu).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(menu);
  expect(menu).toHaveAccessibleName('Close navigation');
  await userEvent.click(menu);
  expect(menu).toHaveAccessibleName('Open navigation');
});
it('hides the badge at zero and refreshes on focus without duplicate visibility requests', async () => {
  count = 0; render(<App />);
  await screen.findByRole('link', { name: 'Notifications, 0 unread' });
  expect(document.querySelector('.notification-badge')).toBeNull();
  count = 7;
  await act(async () => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
  await screen.findByRole('link', { name: 'Notifications, 7 unread' });
  expect(document.querySelector('.notification-badge')).toHaveTextContent('7');
  expect(requests.filter((r) => r.path === '/notifications/unread-count/')).toHaveLength(2);
});
it('polls only while visible and cleans up on unmount', async () => {
  const view = render(<App />);
  await screen.findByRole('link', { name: 'Notifications, 25 unread' });
  vi.useFakeTimers();
  // Mount a fresh authenticated session so its interval uses the controlled clock.
  view.unmount();
  const polling = render(<App />);
  await act(async () => { await Promise.resolve(); });
  const before = requests.filter((r) => r.path === '/notifications/unread-count/').length;
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(requests.filter((r) => r.path === '/notifications/unread-count/')).toHaveLength(before);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  count = 4;
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(screen.getByRole('link', { name: 'Notifications, 4 unread' })).toBeInTheDocument();
  polling.unmount();
  const after = requests.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
  expect(requests).toHaveLength(after);
  vi.useRealTimers();
});
it('marks read through the CSRF client and refreshes list and global count once', async () => {
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Mark as read' }));
  expect(await screen.findByText('Read')).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: 'Notifications, 24 unread' })).toBeInTheDocument();
  const request = requests.find((r) => r.options.method === 'PATCH');
  expect(request.path).toBe(`/notifications/${uid}/read/`);
  expect(request.options.body).toBe('{}');
  expect(request.options.headers['X-CSRFToken']).toBe('f9');
  expect(request.options.credentials).toBe('include');
  expect(requests.filter((r) => r.path === '/notifications/unread-count/')).toHaveLength(2);
});
it('removes the badge after the last notification is marked read', async () => {
  count = 1; render(<App />);
  await screen.findByRole('link', { name: 'Notifications, 1 unread' });
  expect(document.querySelector('.notification-badge')).toHaveTextContent('1');
  await userEvent.click(await screen.findByRole('button', { name: 'Mark as read' }));
  await screen.findByRole('link', { name: 'Notifications, 0 unread' });
  expect(document.querySelector('.notification-badge')).toBeNull();
});
it('highlights an assigned expense notification until read and retains its expense destination', async () => {
  notes[0] = { ...notes[0], type: 'expense_added', related_type: 'expense', message: 'Admin added ₹700.00, paid by you, in Trip.' };
  render(<App />);
  const message = await screen.findByText('By Admin');
  expect(message.closest('li')).toHaveClass('notification-expense-notice');
  expect(message.closest('li').querySelector('.notification-card-heading .icon')).not.toBeNull();
  expect(message.closest('li').querySelector('.money')).not.toHaveClass('payment-direction--incoming', 'payment-direction--outgoing');
  await userEvent.click(screen.getByRole('button', { name: 'Mark as read' }));
  await screen.findByText('Read');
  expect(screen.getByText('By Admin').closest('li')).not.toHaveClass('notification-expense-notice');
  expect(screen.getByText('By Admin').closest('li').querySelector('.notification-card-heading .icon')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Open notification' }));
  await waitFor(() => expect(screen.getByLabelText('Location')).toHaveTextContent(`/groups/${gid}?expense=${rid}`));
});
it('does not apply the green assignment accent to ordinary expense notifications', async () => {
  notes[0] = { ...notes[0], type: 'expense_added', message: '@rahul added an expense to Trip' };
  render(<App />);
  const message = await screen.findByText('By @rahul');
  expect(message.closest('li')).not.toHaveClass('notification-expense-notice');
  expect(message.closest('li')).toHaveClass('notification-unread');
  expect(message.closest('li')).toHaveClass('notification-expense-other');
});
it('uses the plain Expense added title and neutral amount for a non-payer, clearing the red accent on read', async () => {
  notes[0] = { ...notes[0], type: 'expense_added', related_type: 'expense', message: '@rahul added a ₹500.00 expense to Goa Trip' };
  render(<App />);
  const card = await screen.findByRole('button', { name: 'Open notification' });
  expect(within(card).getByText('Expense added')).toBeInTheDocument();
  expect(within(card).getByText('By @rahul')).toBeInTheDocument();
  expect(within(card).getByText('Goa Trip')).toBeInTheDocument();
  expect(within(card).getByText('₹500.00')).not.toHaveClass('payment-direction--incoming', 'payment-direction--outgoing');
  expect(card.closest('li')).toHaveClass('notification-expense-other');
  expect(card).not.toHaveTextContent('by someone else');
  await userEvent.click(screen.getByRole('button', { name: 'Mark as read' }));
  await screen.findByText('Read');
  expect(screen.getByText('By @rahul').closest('li')).not.toHaveClass('notification-expense-other');
  expect(requests.filter((request) => request.options.method === 'PATCH')).toHaveLength(1);
});
it('stacks available amount, actor and group inside one keyboard-accessible card', async () => {
  notes[0] = { ...notes[0], type: 'expense_added', related_type: 'expense', message: 'Aman added ₹500.00, paid by you, in Goa Trip.' };
  render(<App />);
  const card = await screen.findByRole('button', { name: 'Open notification' });
  const body = card.querySelector('.notification-card-body');
  expect([...body.children].map((node) => node.textContent)).toEqual(['₹500.00', 'By Aman', 'Goa Trip']);
  expect(within(card).getByText('₹500.00').closest('strong')).toHaveClass('notification-card-amount');
  expect(card.closest('li').querySelector('time')).toBeNull();
  card.focus(); await userEvent.keyboard('{Enter}');
  await waitFor(() => expect(screen.getByLabelText('Location')).toHaveTextContent(`/groups/${gid}?expense=${rid}`));
  expect(requests.filter((r) => r.options.method === 'PATCH')).toHaveLength(1);
});
it('shows confirmed payment status without fabricating missing amount or identities', async () => {
  notes[0] = { ...notes[0], type: 'payment_confirmed', is_read: true };
  render(<App />);
  const card = await screen.findByRole('button', { name: 'Open notification' });
  expect(card).toHaveTextContent('Payment confirmed');
  expect(card).toHaveTextContent('The receiver confirmed your payment.');
  expect(card.querySelector('.money')).toBeNull();
  expect(card.querySelector('.notification-card-context')).toBeNull();
  expect(card.closest('li')).not.toHaveClass('notification-unread', 'notification-expense-notice');
});
it('safely falls back for unsupported mention events without adding an API type', async () => {
  notes[0] = { ...notes[0], type: 'comment_mentioned', message: '<b>Rahul mentioned you</b>' };
  render(<App />);
  const card = await screen.findByRole('button', { name: 'Open notification' });
  expect(card).toHaveTextContent('<b>Rahul mentioned you</b>');
  expect(card.querySelector('b')).toBeNull();
  expect(card.querySelector('.money')).toBeNull();
  expect(await notificationTarget(notes[0])).toBe('/dashboard');
});
it('paginates using B8 page envelopes', async () => {
  handler = (path) => {
    if (path === '/notifications/?page=1') return json(page(notes, 21, '?page=2'));
    if (path === '/notifications/?page=2') return json(page([{ ...notes[0], is_read: true, message: 'Later page' }], 21, null, '?page=1'));
  };
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
  expect(await screen.findByText('Read')).toBeInTheDocument();
  expect(screen.getByText('Page 2')).toBeInTheDocument();
});
it('opens payment notification using settlement UUID and marks it read', async () => {
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Open notification' }));
  expect(await screen.findByRole('heading', { name: 'Destination' })).toBeInTheDocument();
  expect(screen.getByLabelText('Location')).toHaveTextContent(`/groups/${gid}/settlements/${rid}`);
  expect(requests.some((r) => r.path === `/settlements/${rid}/`)).toBe(true);
});
it('routes all seven event types and rejects external or mismatched targets', async () => {
  for (const type of Object.keys(EVENT_LABELS)) {
    if (type === 'comment_mentioned') continue; // Separate exact-comment navigation test below.
    const related_type = type.startsWith('invitation_') ? 'invitation' : type === 'expense_added' ? 'expense' : 'settlement';
    const target = await notificationTarget({ ...notes[0], type, related_type });
    expect(target).toBe(related_type === 'invitation' ? '/invitations' : related_type === 'expense' ? `/groups/${gid}?expense=${rid}` : `/groups/${gid}/settlements/${rid}`);
  }
  expect(await notificationTarget({ ...notes[0], group_id: 'https://evil.test' })).toBe('/dashboard');
  expect(await notificationTarget({ ...notes[0], type: 'unknown' })).toBe('/dashboard');
  handler = () => json({ settlement: { group_id: uid } });
  expect(await notificationTarget(notes[0])).toBe('/dashboard');
});
it('opens a mention at its exact discussion message with creator/group details', async () => {
  notes[0] = { ...notes[0], type: 'comment_mentioned', related_type: 'comment', message: '@rahul mentioned you in Trip' };
  handler = (path) => path.includes('/comments/?') ? json(page([{ id: rid, group_id: gid }])) : null;
  render(<App />);
  expect(await screen.findByText('You were mentioned')).toBeInTheDocument();
  expect(screen.getByText('By @rahul')).toBeInTheDocument();
  expect(screen.getByText('Trip')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Open notification' }));
  await waitFor(() => expect(screen.getByLabelText('Location')).toHaveTextContent(`/groups/${gid}?panel=discussion&comment=${rid}`));
});
it('falls back to dashboard for inaccessible/deleted resources', async () => {
  handler = (path) => path.startsWith('/settlements/') ? json({ code: 'NOT_FOUND', message: 'Gone' }, 404) : null;
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Open notification' }));
  expect(await screen.findByRole('heading', { name: 'Destination' })).toBeInTheDocument();
  expect(screen.getByLabelText('Location')).toHaveTextContent('/dashboard');
});
it('renders empty state and recovers listing outage with Retry', async () => {
  let down = true;
  handler = (path) => { if (path.startsWith('/notifications/?')) { if (down) throw new TypeError('offline'); return json(page([])); } };
  render(<App />);
  expect(await screen.findByText(UNAVAILABLE_MESSAGE, { exact: false })).toBeInTheDocument();
  down = false; await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('No notifications yet')).toBeInTheDocument();
});
it('retries count failures without inventing a zero unread badge', async () => {
  let down = true;
  handler = (path) => { if (path === '/notifications/unread-count/' && down) throw new TypeError('offline'); };
  render(<App />);
  await screen.findByRole('button', { name: 'Retry unread count' });
  expect(screen.queryByRole('link', { name: 'Notifications, 0 unread' })).not.toBeInTheDocument();
  down = false; await userEvent.click(screen.getByRole('button', { name: 'Retry unread count' }));
  expect(await screen.findByRole('link', { name: 'Notifications, 25 unread' })).toBeInTheDocument();
});
it('refreshes after relevant writes without polling or duplicate refresh events', async () => {
  render(<App />);
  await screen.findByRole('link', { name: 'Notifications, 25 unread' });
  count = 26;
  const { act } = await import('@testing-library/react');
  await act(async () => { await api.post(`/groups/${gid}/settlements/`, {}); });
  expect(await screen.findByRole('link', { name: 'Notifications, 26 unread' })).toBeInTheDocument();
  expect(requests.filter((r) => r.path === '/notifications/unread-count/')).toHaveLength(2);
});
it('clears user-specific state on account change and ignores stale count responses', async () => {
  let finish;
  handler = (path) => { if (path === '/notifications/unread-count/') return new Promise((resolve) => { finish = resolve; }); };
  const view = render(<App />);
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  const oldFinish = finish;
  auth = { status: 'authenticated', user: { id: rid, email_verified: true } };
  notes = [{ ...notes[0], type: 'invitation_received', message: 'Second user notification' }];
  handler = null; count = 3;
  view.rerender(<App />);
  expect(await screen.findByRole('link', { name: 'Notifications, 3 unread' })).toBeInTheDocument();
  expect(await screen.findByText('Second user notification')).toBeInTheDocument();
  const { act } = await import('@testing-library/react');
  await act(async () => oldFinish(json({ unread_count: 999 })));
  expect(screen.queryByRole('link', { name: 'Notifications, 999 unread' })).not.toBeInTheDocument();
});
it('displays recipient permission failures without pretending mark-read succeeded', async () => {
  handler = (path, method) => method === 'PATCH' ? json({ code: 'NOT_FOUND', message: 'Notification not found.' }, 404) : null;
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Mark as read' }));
  expect(await screen.findByText('Notification not found.')).toBeInTheDocument();
  expect(screen.getByText('Unread')).toBeInTheDocument();
});
