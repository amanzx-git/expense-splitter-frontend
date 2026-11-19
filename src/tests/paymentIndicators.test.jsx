import { writeFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, Link } from 'react-router-dom';
import PaymentActionsProvider, { actionsForSettlement } from '../features/settlements/PaymentActionsProvider.jsx';
import PaymentIndicators from '../features/settlements/PaymentIndicators.jsx';
import NotificationsProvider from '../features/notifications/NotificationsProvider.jsx';
import NotificationBell from '../features/notifications/NotificationBell.jsx';
import DashboardPage from '../pages/DashboardPage.jsx';

let user, settlements, calls, secondPage;
vi.mock('../hooks/useAuth.js', () => ({ useAuth: () => ({ user, status: user ? 'authenticated' : 'anonymous' }) }));
const me = { id: 'me', username: 'aman', full_name: 'Aman' };
const other = { id: 'other', username: 'rahul', full_name: 'Rahul' };
const third = { id: 'third', username: 'priya', full_name: 'Priya' };
const groups = [{ id: 'g', name: 'Trip', member_count: 3, my_role: 'member' }, { id: 'neutral', name: 'Dinner', member_count: 2 }];
const transaction = (id, payer, receiver, status = 'pending') => ({ id, payer, receiver, status, amount: '250.50' });
const page = (results, next = null) => ({ results, count: results.length, next, previous: null });
beforeEach(() => {
  user = me; calls = []; secondPage = false;
  settlements = {
    g: { id: 's', group_id: 'g', status: 'pending', transactions: [
      transaction('pay1', me, other), transaction('pay2', me, third),
      transaction('confirm', other, me, 'payment_reported'),
      transaction('waiting', me, other, 'payment_reported'),
      transaction('done', me, other, 'done'), transaction('unrelated', other, third),
    ] },
    neutral: { id: 'n', group_id: 'neutral', status: 'pending', transactions: [transaction('not-mine', other, third)] },
  };
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    calls.push(url);
    let body;
    if (url === '/api/v1/notifications/unread-count/') body = { unread_count: 7 };
    else if (url === '/api/v1/groups/?page=1') body = page(secondPage ? [groups[0]] : groups, secondPage ? '?page=2' : null);
    else if (url === '/api/v1/groups/?page=2') body = page([groups[1]]);
    else if (url.includes('/invitations/')) body = page([]);
    else if (url.includes('/groups/g/settlements/')) body = page(settlements.g ? [settlements.g] : []);
    else if (url.includes('/groups/neutral/settlements/')) body = page(settlements.neutral ? [settlements.neutral] : []);
    else if (url === '/api/v1/settlements/s/') body = { settlement: settlements.g };
    else if (url === '/api/v1/settlements/n/') body = { settlement: settlements.neutral };
    else throw new Error(url);
    return new Response(JSON.stringify(body), { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function open() {
  return render(<MemoryRouter initialEntries={['/dashboard']}><NotificationsProvider><PaymentActionsProvider><PaymentIndicators /><NotificationBell />
    <Routes><Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/groups/:groupId/settlements/:settlementId" element={<><p>Exact statement</p><Link to="/dashboard">Dashboard</Link></>} />
    </Routes></PaymentActionsProvider></NotificationsProvider></MemoryRouter>);
}
it('counts actionable transactions, highlights only relevant groups, and shares group requests', async () => {
  open();
  expect(await screen.findByRole('button', { name: 'Payments to make, 2' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Payments to confirm, 1' })).toBeInTheDocument();
  const card = screen.getByRole('link', { name: 'Trip' }).closest('li');
  expect(card).toHaveClass('group-needs-payment');
  expect(card).toHaveTextContent('Action needed'); expect(card).toHaveTextContent('2 to pay'); expect(card).toHaveTextContent('1 to confirm');
  expect(card.querySelectorAll('.payment-direction--outgoing')).toHaveLength(2);
  expect(card.querySelectorAll('.payment-direction--incoming')).toHaveLength(1);
  expect(within(card).getByRole('link', { name: 'View official statement' })).toHaveAttribute('href', '/groups/g/settlements/s');
  expect(screen.getByRole('link', { name: 'Dinner' }).closest('li')).not.toHaveClass('group-needs-payment');
  expect(calls.filter((url) => url === '/api/v1/groups/?page=1')).toHaveLength(1);
});
it.each([['Payments to make, 2', 'Pay Rahul', 'pay1'], ['Payments to confirm, 1', 'Confirm from Rahul', 'confirm']])('opens exact payment from %s and dismisses with Escape', async (label, text, payment) => {
  open(); const trigger = await screen.findByRole('button', { name: label });
  trigger.focus(); await userEvent.keyboard('{Enter}');
  const link = screen.getByRole('link', { name: new RegExp(text) });
  expect(link).toHaveAttribute('href', `/groups/g/settlements/s?payment=${payment}`);
  expect(link).toHaveTextContent('Trip');
  await userEvent.keyboard('{Escape}'); expect(trigger).toHaveFocus(); expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(trigger); await userEvent.click(screen.getByRole('link', { name: new RegExp(text) }));
  expect(await screen.findByText('Exact statement')).toBeInTheDocument();
});
it('refreshes after local financial writes and group navigation without polling', async () => {
  open(); await screen.findByRole('button', { name: 'Payments to make, 2' });
  settlements.g.transactions[0].status = 'payment_reported';
  settlements.g.transactions[2].status = 'done';
  window.dispatchEvent(new Event('splitter:notifications-changed'));
  await screen.findByRole('button', { name: 'Payments to make, 1' });
  expect(screen.queryByRole('button', { name: /Payments to confirm,/ })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Payments to make, 1' }));
  await userEvent.click(screen.getByRole('link', { name: /Pay Priya/ }));
  settlements.g.status = 'completed';
  await userEvent.click(screen.getByRole('link', { name: 'Dashboard' }));
  await screen.findByRole('link', { name: 'Trip' });
  expect(screen.queryByRole('button', { name: /Payments to make,/ })).not.toBeInTheDocument();
});
it('loads actions across paginated groups', async () => {
  secondPage = true;
  settlements.neutral.transactions = [transaction('page2', other, me, 'payment_reported')];
  open(); await screen.findByRole('button', { name: 'Payments to confirm, 2' });
  expect(calls).toContain('/api/v1/groups/?page=2');
});
it('does not fetch details or show indicators before an official statement exists', async () => {
  settlements.g = null; settlements.neutral = null;
  open(); await screen.findByRole('link', { name: 'Trip' });
  expect(screen.queryByRole('button', { name: /Payments to/ })).not.toBeInTheDocument();
  expect(calls.some((url) => url.startsWith('/api/v1/settlements/'))).toBe(false);
});
it('ignores completed statements, other parties, and mismatched groups', () => {
  expect(actionsForSettlement(groups[0], { ...settlements.g, status: 'completed' }, me.id)).toEqual([]);
  expect(actionsForSettlement(groups[1], settlements.g, me.id)).toEqual([]);
  expect(actionsForSettlement(groups[0], settlements.g, 'outsider')).toEqual([]);
});
it('makes no payment requests for guests and clears recipient data on sign-out', async () => {
  const view = open(); await screen.findByRole('button', { name: 'Payments to make, 2' });
  view.unmount(); user = null; calls = [];
  render(<MemoryRouter><NotificationsProvider><PaymentActionsProvider><PaymentIndicators /><NotificationBell /></PaymentActionsProvider></NotificationsProvider></MemoryRouter>);
  await waitFor(() => expect(screen.queryByRole('button', { name: /Payments to/ })).not.toBeInTheDocument());
  expect(calls).toEqual([]);
});

it.each([['pending', me, other, 'Payment pending', 'Payments to make, 1'], ['payment_reported', other, me, 'Confirm payment', 'Payments to confirm, 1']])('shows the single-action dashboard label for %s', async (status, payer, receiver, label, count) => {
  settlements.g.transactions = [transaction('single', payer, receiver, status)];
  open(); await screen.findByRole('button', { name: count });
  expect(screen.getByRole('link', { name: 'Trip' }).closest('li')).toHaveTextContent(label);
  expect(await screen.findByRole('link', { name: 'Notifications, 7 unread' })).toBeInTheDocument();
});
it('treats waiting payer confirmations as informational and refreshes after official generation', async () => {
  settlements.g.transactions = [transaction('waiting', me, other, 'payment_reported')];
  open(); await screen.findByRole('link', { name: 'Trip' });
  expect(screen.queryByRole('button', { name: /Payments to/ })).not.toBeInTheDocument();
  settlements.g.transactions.push(transaction('new', me, other));
  window.dispatchEvent(new Event('splitter:notifications-changed'));
  await screen.findByRole('button', { name: 'Payments to make, 1' });
  expect(screen.getByRole('link', { name: 'Trip' }).closest('li')).toHaveClass('group-needs-payment');
});

it('keeps long group names, status, recipient and currency in stacked clickable cards', async () => {
  const original = groups[0].name;
  groups[0].name = 'Very long group name for our weekend trip with everyone';
  settlements.g.transactions[0].amount = '12345678.90';
  try {
    open(); await userEvent.click(await screen.findByRole('button', { name: 'Payments to make, 2' }));
    const panel = screen.getByRole('region', { name: 'Payments to make' });
    const link = within(panel).getByRole('link', { name: /Pay Rahul/ });
    expect(link.querySelector('.payment-card-top')).toHaveTextContent(groups[0].name);
    expect(link.querySelector('.payment-card-top small')).toHaveTextContent('Payment pending');
    expect(link.querySelector('.payment-card-copy')).toHaveTextContent('Pay Rahul');
    expect(link.querySelector('.money')).toHaveClass('payment-direction--outgoing');
    expect(link.querySelector('.payment-card-chevron')).toHaveAttribute('aria-hidden', 'true');
    expect(within(panel).getByRole('button', { name: 'Close payment indicators' })).not.toHaveTextContent('?');
    if (process.env.PAYMENT_LAYOUT_PREVIEW) writeFileSync(process.env.PAYMENT_LAYOUT_PREVIEW, panel.outerHTML);
    await userEvent.click(link);
    expect(await screen.findByText('Exact statement')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Payments to make' })).not.toBeInTheDocument();
  } finally { groups[0].name = original; }
});
