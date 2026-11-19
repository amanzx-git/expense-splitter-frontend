import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import NotificationsPage from '../pages/NotificationsPage.jsx';
import NotificationsProvider from '../features/notifications/NotificationsProvider.jsx';
import SettlementPage from '../pages/SettlementPage.jsx';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import GuestRoute from '../components/GuestRoute.jsx';
import { notificationTarget } from '../features/notifications/navigation.js';

const id = (n) => `123e4567-e89b-42d3-a456-${String(n).padStart(12, '0')}`;
const groupId = id(1), settlementId = id(2), receiver = id(3), payer1 = id(4), payer2 = id(5), outsider = id(6);
const payment1 = id(7), payment2 = id(8), noteId = id(9);
const path = `/groups/${groupId}/settlements/${settlementId}`;
let auth, settlement, note, requests, denied;
vi.mock('../hooks/useAuth.js', () => ({ useAuth: () => auth }));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  auth = { status: 'authenticated', user: { id: receiver, email_verified: true } };
  requests = []; denied = false; document.cookie = 'csrftoken=payment-notification-test; path=/';
  settlement = { id: settlementId, group_id: groupId, sequence_number: 1, status: 'pending', created_at: '2026-11-14T08:00:00Z', completed_at: null, expense_ids: [], transactions: [
    { id: payment1, payer: { id: payer1, username: 'aman_one', full_name: 'Aman' }, receiver: { id: receiver, username: 'sam' }, amount: '500.00', status: 'payment_reported', reported_at: '2026-11-14T09:00:00Z', confirmed_at: null, payment: { upi_uri: null, qr_available: false } },
    { id: payment2, payer: { id: payer2, username: 'aman_two', full_name: 'Aman' }, receiver: { id: receiver, username: 'sam' }, amount: '500.00', status: 'payment_reported', reported_at: '2026-11-14T10:00:00Z', confirmed_at: null, payment: { upi_uri: null, qr_available: false } },
  ] };
  note = { id: noteId, type: 'payment_reported', message: 'Aman marked \u20b9500.00 as paid.', group_id: groupId, related_type: 'settlement', related_id: settlementId, payment_id: payment2, action_required: true, is_read: false, created_at: '2026-11-14T10:00:00Z' };
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    const endpoint = url.replace('/api/v1', ''); requests.push({ endpoint, options });
    if (endpoint === '/notifications/unread-count/') return json({ unread_count: note.is_read ? 0 : 1 });
    if (endpoint.startsWith('/notifications/?')) return json({ count: 1, next: null, previous: null, results: [note] });
    if (endpoint.endsWith('/read/')) { note.is_read = true; return json({ notification: note }); }
    if (endpoint === `/settlements/${settlementId}/`) return denied ? json({ code: 'NOT_FOUND', message: 'Not found.' }, 404) : json({ settlement });
    if (endpoint.startsWith('/transactions/')) {
      const payment = settlement.transactions.find((item) => endpoint.includes(item.id));
      const confirm = endpoint.endsWith('/confirm/');
      if (auth.user.id !== (confirm ? payment.receiver.id : payment.payer.id)) return json({ code: 'PERMISSION_DENIED', message: 'Not allowed.' }, 403);
      payment.status = confirm ? 'done' : 'payment_reported';
      if (confirm) payment.confirmed_at = '2026-11-14T11:00:00Z';
      if (settlement.transactions.every((item) => item.status === 'done')) settlement.status = 'completed';
      if (payment.id === note.payment_id && confirm) { note.action_required = false; note.is_read = true; }
      return json({ transaction: payment, ...(confirm ? { settlement_status: settlement.status } : {}) });
    }
    throw new Error(`Unexpected endpoint ${endpoint}`);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Location() {
  const location = useLocation(), navigate = useNavigate();
  return <><output aria-label="Location">{location.pathname + location.search}</output><button onClick={() => navigate(-1)}>Browser back</button></>;
}
function Harness({ initial = '/notifications' }) {
  return <MemoryRouter initialEntries={[initial]}><NotificationsProvider>
    <Link to="/notifications">Notifications</Link>
    <Routes>
      <Route element={<ProtectedRoute />}>
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/groups/:groupId/settlements/:settlementId" element={<SettlementPage />} />
      </Route>
      <Route element={<GuestRoute />}><Route path="/login" element={<h1>Sign in</h1>} /></Route>
      <Route path="/dashboard" element={<h1>Dashboard</h1>} />
    </Routes><Location />
  </NotificationsProvider></MemoryRouter>;
}
const panel = () => within(screen.getByRole('dialog', { name: 'Payment details' }));

it('opens the exact reported payment from a notification, even with identical names and amounts', async () => {
  render(<Harness />);
  expect(await screen.findByText('Payment needs confirmation')).toBeInTheDocument();
  expect(screen.getByText('Aman marked \u20b9500.00 as paid.')).toBeInTheDocument();
  expect(screen.getByText('Action needed')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Open notification' }));
  await waitFor(() => expect(screen.getByLabelText('Location')).toHaveTextContent(`${path}?payment=${payment2}`));
  await screen.findByRole('dialog', { name: 'Payment details' });
  expect(await panel().findByText('@aman_two')).toBeInTheDocument();
  expect(panel().queryByText('@aman_one')).not.toBeInTheDocument();
  expect(panel().getByRole('button', { name: 'Confirm money received' })).toBeInTheDocument();
  expect(panel().getByText('Payment history')).toBeInTheDocument();
  expect(requests.some((item) => item.options.method === 'POST')).toBe(false);
  await userEvent.click(panel().getByRole('button', { name: 'Confirm money received' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirm received outside the app' }));
  await panel().findByText('Payment completed', { selector: 'strong' });
  expect(requests.find((item) => item.options.method === 'POST').endpoint).toBe(`/transactions/${payment2}/confirm/`);
  expect(settlement.transactions[0].status).toBe('payment_reported');
});

it('keeps Action needed after a notification is read, but not after confirmation', async () => {
  render(<Harness />);
  await screen.findByText('Action needed');
  await userEvent.click(screen.getByRole('button', { name: 'Mark as read' }));
  expect(await screen.findByText('Read')).toBeInTheDocument();
  expect(screen.getByText('Action needed')).toBeInTheDocument();
  note.action_required = false;
  await act(async () => window.dispatchEvent(new Event('splitter:notifications-changed')));
  await waitFor(() => expect(screen.queryByText('Action needed')).not.toBeInTheDocument());
});

it('opens a stale completed payment read-only without instructions or another confirmation', async () => {
  settlement.transactions[1].status = 'done'; settlement.transactions[1].confirmed_at = '2026-11-14T11:00:00Z';
  note.action_required = false; note.is_read = true;
  render(<Harness />);
  await screen.findByRole('button', { name: 'Open notification' });
  expect(screen.queryByText('Action needed')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Open notification' }));
  await screen.findByRole('dialog', { name: 'Payment details' });
  expect(await panel().findByText('Payment completed', { selector: 'strong' })).toBeInTheDocument();
  expect(panel().queryByRole('button', { name: 'Confirm money received' })).not.toBeInTheDocument();
  expect(panel().queryByRole('button', { name: "I've paid" })).not.toBeInTheDocument();
  expect(panel().queryByText('How to pay')).not.toBeInTheDocument();
  expect(panel().getByText('Payment history')).toBeInTheDocument();
});

it('counts relevant actions, puts Who pays whom first, and opens each pending payment directly', async () => {
  render(<Harness initial={path} />);
  const attention = await screen.findByRole('region', { name: 'Action needed' });
  expect(attention).toHaveTextContent('2 payments');
  const buttons = within(attention).getAllByRole('button');
  await userEvent.click(buttons[1]);
  await screen.findByRole('dialog', { name: 'Payment details' });
  expect(await panel().findByText('@aman_two')).toBeInTheDocument();
  await userEvent.click(panel().getByRole('button', { name: 'Close payment details' }));
  await userEvent.click(within(screen.getByRole('region', { name: 'Action needed' })).getAllByRole('button')[0]);
  expect(await panel().findByText('@aman_one')).toBeInTheDocument();
  const who = screen.getByRole('heading', { name: 'Who pays whom' });
  const progress = screen.getByRole('region', { name: 'Payment progress' });
  expect(attention.compareDocumentPosition(who) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(who.compareDocumentPosition(progress) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Your payment details' })).not.toBeInTheDocument();
});

it.each([outsider, payer1])('does not warn unrelated or waiting users about someone else\'s confirmation: %s', async (actor) => {
  auth.user.id = actor;
  render(<Harness initial={path} />);
  await screen.findByRole('heading', { name: 'Who pays whom' });
  expect(screen.queryByRole('region', { name: 'Action needed' })).not.toBeInTheDocument();
});

it('gives a payer only their own pending action and never receipt confirmation', async () => {
  auth.user.id = payer2; settlement.transactions[1].status = 'pending';
  render(<Harness initial={path} />);
  const attention = await screen.findByRole('region', { name: 'Action needed' });
  expect(attention).toHaveTextContent('1 payment');
  expect(attention).toHaveTextContent('Pay sam');
  await userEvent.click(within(attention).getByRole('button'));
  expect(await panel().findByRole('button', { name: "I've paid" })).toBeInTheDocument();
  expect(panel().queryByRole('button', { name: 'Confirm money received' })).not.toBeInTheDocument();
});

it('clears attention, advances progress and updates notifications when the last receipt is confirmed', async () => {
  settlement.transactions[0].status = 'done';
  render(<Harness initial={`${path}?payment=${payment2}`} />);
  await panel().findByRole('button', { name: 'Confirm money received' });
  await userEvent.click(panel().getByRole('button', { name: 'Confirm money received' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirm received outside the app' }));
  await panel().findByText('Payment completed', { selector: 'strong' });
  expect(screen.queryByRole('region', { name: 'Action needed' })).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Payment progress' })).toHaveTextContent('2 of 2 payments confirmed');
  expect(screen.getByText('Settlement complete')).toBeInTheDocument();
  await userEvent.click(panel().getByRole('button', { name: 'Close payment details' }));
  await userEvent.click(screen.getByRole('link', { name: 'Notifications' }));
  expect(await screen.findByText('Read')).toBeInTheDocument();
  expect(screen.queryByText('Action needed')).not.toBeInTheDocument();
});

it('preserves an exact payment link across refresh and keeps other parameters when closing', async () => {
  const url = `${path}?keep=yes&payment=${payment2}`;
  const view = render(<Harness initial={url} />);
  await screen.findByRole('dialog', { name: 'Payment details' });
  expect(await panel().findByText('@aman_two')).toBeInTheDocument();
  view.unmount();
  render(<Harness initial={url} />);
  await screen.findByRole('dialog', { name: 'Payment details' });
  expect(await panel().findByText('@aman_two')).toBeInTheDocument();
  await userEvent.click(panel().getByRole('button', { name: 'Close payment details' }));
  expect(screen.getByLabelText('Location')).toHaveTextContent(`${path}?keep=yes`);
  expect(screen.getByLabelText('Location')).not.toHaveTextContent('payment=');
  expect(requests.some((item) => item.options.method === 'POST')).toBe(false);
});

it('preserves the payment destination through authentication', async () => {
  auth = { ...auth, status: 'anonymous', user: null };
  const url = `${path}?payment=${payment2}`;
  const view = render(<Harness initial={url} />);
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  expect(new URLSearchParams(screen.getByLabelText('Location').textContent.split('?')[1]).get('next')).toBe(url);
  auth = { status: 'authenticated', user: { id: receiver, email_verified: true } };
  view.rerender(<Harness initial={url} />);
  await screen.findByRole('dialog', { name: 'Payment details' });
  expect(await panel().findByText('@aman_two')).toBeInTheDocument();
});

it('rechecks current backend state on return to the page', async () => {
  render(<Harness initial={path} />);
  await screen.findByRole('region', { name: 'Action needed' });
  settlement.transactions.forEach((item) => { item.status = 'done'; }); settlement.status = 'completed';
  await act(async () => window.dispatchEvent(new Event('focus')));
  await screen.findByText('Settlement complete');
  expect(screen.queryByRole('region', { name: 'Action needed' })).not.toBeInTheDocument();
});

it('never guesses another payment for an invalid direct link', async () => {
  render(<Harness initial={`${path}?payment=${id(999)}`} />);
  expect(await panel().findByText('Payment not found in this group.')).toBeInTheDocument();
  expect(panel().queryByRole('button', { name: 'Confirm money received' })).not.toBeInTheDocument();
  expect(requests.some((item) => item.options.method === 'POST')).toBe(false);
});

it('closes an unsubmitted confirmation when browser navigation leaves the payment link', async () => {
  render(<Harness initial={path} />);
  const attention = await screen.findByRole('region', { name: 'Action needed' });
  await userEvent.click(within(attention).getAllByRole('button')[1]);
  await panel().findByRole('button', { name: 'Confirm money received' });
  await userEvent.click(panel().getByRole('button', { name: 'Confirm money received' }));
  expect(screen.getByRole('dialog', { name: 'Confirm money received?' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Browser back' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Confirm money received?' })).not.toBeInTheDocument());
  expect(screen.queryByRole('dialog', { name: 'Payment details' })).not.toBeInTheDocument();
  expect(requests.some((item) => item.options.method === 'POST')).toBe(false);
});

it('falls back safely for inaccessible, mismatched and missing notification targets; legacy links remain valid', async () => {
  denied = true; expect(await notificationTarget(note)).toBe('/dashboard');
  denied = false; expect(await notificationTarget({ ...note, payment_id: id(999) })).toBe('/dashboard');
  expect(await notificationTarget({ ...note, payment_id: 'not-a-uuid' })).toBe('/dashboard');
  expect(await notificationTarget({ ...note, group_id: id(999) })).toBe('/dashboard');
  expect(await notificationTarget({ ...note, payment_id: null })).toBe(path);
});
