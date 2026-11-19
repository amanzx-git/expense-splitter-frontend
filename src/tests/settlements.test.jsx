import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GroupExpenses from '../features/expenses/GroupExpenses.jsx';
import SettlementPage from '../pages/SettlementPage.jsx';
import { UNAVAILABLE_MESSAGE } from '../api/errors.js';

vi.mock('../hooks/useAuth.js', () => ({ useAuth: () => ({ user: { id: '123e4567-e89b-42d3-a456-426614174001' } }) }));
const groupId = '123e4567-e89b-42d3-a456-426614174000';
const sid = '123e4567-e89b-42d3-a456-426614174010';
const eid = '123e4567-e89b-42d3-a456-426614174020';
let group, settlement, summary, balances, requests, handler, generated;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const page = (results, next = null, previous = null, count = results.length) => ({ count, next, previous, results });
beforeEach(() => {
  document.cookie = 'csrftoken=f7; path=/';
  group = { id: groupId, my_role: 'admin' };
  settlement = { id: sid, group_id: groupId, sequence_number: 1, status: 'pending', created_by: '123e4567-e89b-42d3-a456-426614174001', created_at: '2026-11-13T10:00:00Z', completed_at: null, expense_ids: [eid], transactions: [{ id: '123e4567-e89b-42d3-a456-426614174030', payer: { id: '123e4567-e89b-42d3-a456-426614174002', username: 'rahul' }, receiver: { id: '123e4567-e89b-42d3-a456-426614174001', username: 'aman' }, amount: '150.01', status: 'pending', reported_at: null, confirmed_at: null, payment: { upi_uri: 'upi://pay?pa=private@bank', qr_available: true } }] };
  summary = { id: sid, group_id: groupId, sequence_number: 1, status: 'pending', created_at: settlement.created_at, completed_at: null, expense_count: 1, transaction_count: 1, confirmed_transaction_count: 0, total_transfer_amount: '150.01' };
  balances = { group_id: groupId, currency: 'INR', unsettled_expense_total: '300.02', members: [], blockers: [], can_generate_settlement: true };
  requests = []; handler = null; generated = false;
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    const path = url.replace('/api/v1', '');
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ path, method: options.method, body, options });
    const custom = handler?.(path, options.method);
    if (custom) return custom;
    if (path.endsWith('/balances/')) return json(balances);
    if (path === `/settlements/${sid}/`) return json({ settlement });
    if (path.includes('/settlements/')) {
      if (options.method === 'POST') { generated = true; return json({ settlement }, 201); }
      return json(page(generated ? [summary] : []));
    }
    if (path.includes('/expenses/?') || path.includes('/comments/')) return json(page([]));
    throw new Error('Unexpected request '+path);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function open(detail = false) {
  return render(<MemoryRouter initialEntries={[detail ? `/groups/${groupId}/settlements/${sid}` : `/groups/${groupId}`]}><Routes>
    <Route path="/groups/:groupId" element={<GroupExpenses group={group} />} />
    <Route path="/groups/:groupId/settlements/:settlementId" element={<SettlementPage />} />
  </Routes></MemoryRouter>);
}
it('shows empty history and requires confirmation before generating with CSRF', async () => {
  open();
  expect(await screen.findByText('No settlements yet')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Generate settlement' }));
  expect(requests.some((r) => r.method === 'POST')).toBe(false);
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create settlement' }));
  expect(await screen.findByRole('link', { name: 'View settlement' })).toHaveAttribute('href', `/groups/${groupId}/settlements/${sid}`);
  await waitFor(() => {
    for (const part of ['/balances/', '/expenses/?', '/settlements/?']) expect(requests.filter((r) => r.path.includes(part)).length).toBeGreaterThan(1);
  });
  const request = requests.find((r) => r.method === 'POST');
  expect(request.body).toEqual({});
  expect(request.options.headers['X-CSRFToken']).toBe('f7');
  expect(request.options.credentials).toBe('include');
  expect(await screen.findByRole('link', { name: 'Settlement #1' })).toBeInTheDocument();
});
it('hides generation from regular members', async () => {
  group.my_role = 'member'; open();
  await screen.findByText('No settlements yet');
  expect(screen.queryByRole('button', { name: 'Generate settlement' })).not.toBeInTheDocument();
});
it('never renders generation in the compact expense body without a header slot', async () => {
  balances.blockers = ['PENDING_INVITATIONS']; balances.can_generate_settlement = false;
  const view = render(<MemoryRouter><GroupExpenses group={group} compact /></MemoryRouter>);
  await screen.findByText('No expenses yet');
  expect(screen.queryByRole('button', { name: 'Generate settlement' })).not.toBeInTheDocument();
  view.unmount(); balances.blockers = []; balances.can_generate_settlement = true;
  render(<MemoryRouter><GroupExpenses group={group} compact /></MemoryRouter>);
  await screen.findByText('No expenses yet');
  expect(screen.queryByRole('button', { name: 'Generate settlement' })).not.toBeInTheDocument();
});
it('disables generation and retains blocker explanations in its tooltip', async () => {
  balances.blockers = ['PENDING_INVITATIONS', 'ACTIVE_SETTLEMENT_EXISTS', 'NO_UNSETTLED_EXPENSES']; balances.can_generate_settlement = false;
  open();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate settlement' })).toHaveAttribute('title', expect.stringContaining('Resolve pending invitations')));
  expect(screen.getByRole('button', { name: 'Generate settlement' })).toHaveAttribute('title', expect.stringContaining('Finish current payments'));
  expect(screen.getByRole('button', { name: 'Generate settlement' })).toBeDisabled();
});
it('handles zero-transfer generation and completed detail', async () => {
  settlement.status = 'completed'; settlement.completed_at = settlement.created_at; settlement.transactions = [];
  open();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate settlement' })).toBeEnabled());
  await userEvent.click(screen.getByRole('button', { name: 'Generate settlement' }));
  await userEvent.click(screen.getByRole('button', { name: 'Create settlement' }));
  expect(await screen.findByText(/No payments are needed/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('link', { name: 'View settlement' }));
  expect(await screen.findByText('No payments needed')).toBeInTheDocument();
  expect(screen.getByText(/These expenses balance out/)).toBeInTheDocument();
});
it('shows 409 server errors and refreshes eligibility', async () => {
  handler = (path, method) => {
    if (method === 'POST') { balances.blockers = ['ACTIVE_SETTLEMENT_EXISTS']; balances.can_generate_settlement = false; return json({ code: 'ACTIVE_SETTLEMENT_EXISTS', message: 'Another admin request created a settlement.' }, 409); }
  };
  open(); await waitFor(() => expect(screen.getByRole('button', { name: 'Generate settlement' })).toBeEnabled());
  await userEvent.click(screen.getByRole('button', { name: 'Generate settlement' }));
  await userEvent.click(screen.getByRole('button', { name: 'Create settlement' }));
  expect(await screen.findByText('Another admin request created a settlement.', { exact: false })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate settlement' })).toBeDisabled());
  expect(screen.queryByRole('link', { name: 'View settlement' })).not.toBeInTheDocument();
});
it('renders immutable detail and never displays UPI or payment actions', async () => {
  open(true);
  expect(await screen.findByRole('list', { name: 'Group payments' })).toBeInTheDocument();
  const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
  expect(within(screen.getByRole('list', { name: 'Group payments' })).getByText(money.format('150.01'))).toBeInTheDocument();
  await userEvent.click(screen.getByText('More details'));
  await userEvent.click(screen.getByText('Included expenses', { selector: 'summary' }));
  expect(screen.getByRole('link', { name: 'View included expense 1' })).toHaveAttribute('href', `/groups/${groupId}?expense=${eid}`);
  expect(document.body.textContent).not.toContain('private@bank');
  expect(document.querySelector('[href^="upi:"]')).toBeNull();
  expect(screen.queryByRole('button', { name: "I've paid" })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Confirm money received' })).not.toBeInTheDocument();
});
it('rejects detail from a different route group', async () => {
  settlement.group_id = eid; open(true);
  expect(await screen.findByText('Settlement not found in this group.')).toBeInTheDocument();
  expect(screen.queryByText(/@rahul pays/)).not.toBeInTheDocument();
});
it('paginates history using summary fields only', async () => {
  handler = (path) => {
    if (path.includes('/settlements/?page=1')) return json(page([summary], '?page=2', null, 21));
    if (path.includes('/settlements/?page=2')) return json(page([{ ...summary, sequence_number: 2 }], null, '?page=1', 21));
  };
  open();
  const history = within(screen.getByRole('region', { name: 'Settlement history' }));
  await history.findByRole('link', { name: 'Settlement #1' });
  expect(history.getByText(/0 of 1 payment confirmed/)).toBeInTheDocument();
  await userEvent.click(history.getByRole('button', { name: 'Next' }));
  expect(await history.findByRole('link', { name: 'Settlement #2' })).toBeInTheDocument();
  expect(requests.some((r) => r.path === `/settlements/${sid}/`)).toBe(false);
});
it('recovers from a detail outage with Retry', async () => {
  let down = true;
  handler = () => { if (down) throw new TypeError('offline'); };
  open(true);
  expect(await screen.findByText(UNAVAILABLE_MESSAGE, { exact: false })).toBeInTheDocument();
  down = false; await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('list', { name: 'Group payments' })).toBeInTheDocument();
});
it('shows permission errors without leaking detail', async () => {
  handler = () => json({ code: 'NOT_FOUND', message: 'Settlement not found.' }, 404);
  open(true);
  expect(await screen.findByText('Settlement not found.')).toBeInTheDocument();
  expect(screen.queryByText(/@rahul pays/)).not.toBeInTheDocument();
});
