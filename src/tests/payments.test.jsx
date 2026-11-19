import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SettlementPage from '../pages/SettlementPage.jsx';
import GroupExpenses from '../features/expenses/GroupExpenses.jsx';
import { UNAVAILABLE_MESSAGE } from '../api/errors.js';
import { validPaymentUri } from '../features/settlements/paymentUri.js';

const payer = '123e4567-e89b-42d3-a456-426614174001';
const receiver = '123e4567-e89b-42d3-a456-426614174002';
const outsider = '123e4567-e89b-42d3-a456-426614174003';
const groupId = '123e4567-e89b-42d3-a456-426614174004';
const sid = '123e4567-e89b-42d3-a456-426614174005';
const tid = '123e4567-e89b-42d3-a456-426614174006';
let actor, settlement, requests, handler;
vi.mock('../hooks/useAuth.js', () => ({ useAuth: () => ({ user: { id: actor } }) }));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const page = { count: 0, next: null, previous: null, results: [] };
beforeEach(() => {
  actor = payer; requests = []; handler = null; document.cookie = 'csrftoken=f8; path=/';
  settlement = { id: sid, group_id: groupId, sequence_number: 1, status: 'pending', created_at: '2026-11-13T10:00:00Z', completed_at: null, expense_ids: [], transactions: [{ id: tid, payer: { id: payer, username: 'aman' }, receiver: { id: receiver, username: 'rahul' }, amount: '150.01', status: 'pending', reported_at: null, confirmed_at: null, payment: { upi_uri: 'upi://pay?pa=rahul%40bank&pn=Rahul+Kumar&am=150.01&cu=INR', qr_available: true } }] };
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    const path = url.replace('/api/v1', '');
    requests.push({ path, options });
    const custom = handler?.(path, options.method);
    if (custom) return custom;
    if (path === `/settlements/${sid}/`) return json({ settlement });
    if (path.startsWith('/transactions/')) {
      const item = settlement.transactions[0];
      if (path.endsWith('/report-payment/')) { item.status = 'payment_reported'; item.reported_at = settlement.created_at; }
      else { item.status = 'done'; item.confirmed_at = settlement.created_at; settlement.status = 'completed'; settlement.completed_at = settlement.created_at; }
      return json({ transaction: item, ...(path.endsWith('/confirm/') ? { settlement_status: settlement.status } : {}) });
    }
    if (path.endsWith('/balances/')) return json({ group_id: groupId, currency: 'INR', unsettled_expense_total: '0.00', members: [], blockers: ['NO_UNSETTLED_EXPENSES'], can_generate_settlement: false });
    return json(page);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function open() {
  return render(<MemoryRouter initialEntries={[`/groups/${groupId}/settlements/${sid}`]}><Routes>
    <Route path="/groups/:groupId/settlements/:settlementId" element={<SettlementPage />} />
    <Route path="/groups/:groupId" element={<GroupExpenses group={{ id: groupId, my_role: 'member' }} />} />
  </Routes></MemoryRouter>);
}
async function details() {
  await userEvent.click(await screen.findByRole('button', { name: 'View payment from aman to rahul' }));
  return within(screen.getByRole('dialog', { name: 'Payment details' }));
}
it.each([
  [payer, 'pending', 'Not paid yet', true, "I've paid"],
  [receiver, 'pending', 'Waiting for payment', false, null],
  [payer, 'payment_reported', 'Waiting for receiver to confirm', false, null],
  [receiver, 'payment_reported', 'Confirm the money arrived', false, 'Confirm money received'],
  [outsider, 'pending', 'Not paid yet', false, null],
  [receiver, 'done', 'Payment completed', false, null],
])('uses authoritative parties and role-specific copy for %s in %s', async (id, status, label, instructions, action) => {
  actor = id;
  settlement.transactions[0].status = status;
  settlement.created_by = outsider; // Creation by an admin never grants payment privileges.
  settlement.transactions[0].created_by = outsider;
  open(); const panel = await details();
  expect(panel.getByText(label, { selector: 'strong' })).toBeInTheDocument();
  expect(!!panel.queryByText('How to pay')).toBe(instructions);
  for (const name of ["I've paid", 'Confirm money received']) {
    expect(!!panel.queryByRole('button', { name })).toBe(name === action);
  }
  expect(panel.getByText('Payment history')).toBeInTheDocument();
  expect(panel.getByRole('button', { name: 'Close payment details' })).toBeInTheDocument();
  expect(panel.getAllByText('₹150.01')).toHaveLength(1);
  if (status === 'done' || id === outsider) expect(panel.getByText('₹150.01')).not.toHaveClass('payment-direction--incoming', 'payment-direction--outgoing');
});
it('shows confirmation progress and the next permitted payment without changing its state', async () => {
  open();
  const overview = await screen.findByRole('region', { name: 'Payment progress' });
  expect(overview).toHaveTextContent('0 of 1 payment confirmed');
  expect(overview).not.toHaveTextContent('pending');
  expect(screen.getByText('More details').closest('details')).not.toHaveAttribute('open');
  expect(within(overview).getByRole('progressbar')).toHaveAttribute('value', '0');
  await userEvent.click(within(screen.getByRole('region', { name: 'Action needed' })).getByRole('button'));
  expect(within(screen.getByRole('dialog', { name: 'Payment details' })).getByRole('button', { name: "I've paid" })).toBeInTheDocument();
  expect(requests.some((request) => request.options.method === 'POST')).toBe(false);
});
it('prioritizes receiver confirmation and keeps reported payments incomplete', async () => {
  actor = receiver; settlement.transactions[0].status = 'payment_reported'; open();
  const overview = await screen.findByRole('region', { name: 'Payment progress' });
  expect(overview).toHaveTextContent('0 of 1 payment confirmed');
  expect(overview).not.toHaveTextContent('awaiting confirmation');
  await userEvent.click(within(screen.getByRole('region', { name: 'Action needed' })).getByRole('button'));
  expect(within(screen.getByRole('dialog', { name: 'Payment details' })).getByRole('button', { name: 'Confirm money received' })).toBeInTheDocument();
});
it('shows complete progress and history without a next action for completed settlements', async () => {
  settlement.status = 'completed'; settlement.transactions[0].status = 'done'; open();
  const overview = await screen.findByRole('region', { name: 'Payment progress' });
  expect(overview).toHaveTextContent('1 of 1 payment confirmed');
  expect(within(overview).getByRole('progressbar')).toHaveAttribute('value', '1');
  expect(within(overview).queryByRole('button')).not.toBeInTheDocument();
  await userEvent.click(screen.getByText('More details'));
  await userEvent.click(screen.getByText('Settlement history', { selector: 'summary' }));
  expect(screen.getByRole('link', { name: 'View settlement history' })).toHaveAttribute('href', `/groups/${groupId}/history?tab=settlements`);
});
it('keeps payment actions in focused details and requires explicit confirmation', async () => {
  open(); const table = await screen.findByRole('list', { name: 'Group payments' });
  expect(within(table).queryByRole('button', { name: "I've paid" })).not.toBeInTheDocument();
  const panel = await details();
  await userEvent.click(panel.getByRole('button', { name: "I've paid" }));
  expect(screen.getByRole('dialog', { name: "Have you paid?" })).toBeInTheDocument();
  expect(requests.some((r) => r.options.method === 'POST')).toBe(false);
  await userEvent.click(within(screen.getByRole('dialog', { name: "Have you paid?" })).getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('dialog', { name: 'Payment details' })).toBeInTheDocument();
});
it('shows compact payment rows and personal summary before revealing payment instructions', async () => {
  open();
  const table = await screen.findByRole('list', { name: 'Group payments' });
  expect(within(table).getByRole('button', { name: 'View payment from aman to rahul' })).toHaveTextContent('aman');
  expect(within(table).queryByText('View details')).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Action needed' })).toHaveTextContent('Pay rahul');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  const panel = await details();
  expect(panel.getByRole('button', { name: "I've paid" })).toBeInTheDocument();
  expect(panel.queryByRole('button', { name: 'Confirm money received' })).not.toBeInTheDocument();
  expect(panel.getByRole('region', { name: 'How to pay' })).toBeVisible();
  const extra = panel.getByText('Details').closest('details');
  expect(extra).not.toHaveAttribute('open');
  await userEvent.click(panel.getByText('Details'));
  expect(extra).toHaveAttribute('open');
  await userEvent.click(panel.getByText('Details'));
  expect(extra).not.toHaveAttribute('open');
  expect(panel.getByRole('link', { name: 'Open UPI app' })).toHaveAttribute('href', settlement.transactions[0].payment.upi_uri);
  expect(panel.getByRole('img')).toBeInTheDocument();
  expect(panel.getByText('Send to: Rahul Kumar (rahul@bank)')).toBeInTheDocument();
});
it('requires confirmation, posts exact CSRF JSON and refreshes the payment after reporting', async () => {
  open(); let panel = await details();
  await userEvent.click(panel.getByRole('button', { name: "I've paid" }));
  expect(requests.some((r) => r.options.method === 'POST')).toBe(false);
  await userEvent.click(within(screen.getByRole('dialog', { name: "Have you paid?" })).getByRole('button', { name: 'Cancel' }));
  await userEvent.click(panel.getByRole('button', { name: "I've paid" }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirm payment sent' }));
  panel = within(screen.getByRole('dialog', { name: 'Payment details' }));
  expect(await panel.findByText('Waiting for receiver to confirm', { selector: 'strong' })).toBeInTheDocument();
  const request = requests.find((r) => r.options.method === 'POST');
  expect(request.path).toBe(`/transactions/${tid}/report-payment/`);
  expect(request.options.body).toBe('{}'); expect(request.options.credentials).toBe('include'); expect(request.options.headers['X-CSRFToken']).toBe('f8');
  expect(panel.queryByRole('button', { name: "I've paid" })).not.toBeInTheDocument();
  await userEvent.click(panel.getByRole('button', { name: 'Close payment details' }));
  const trigger = screen.getByRole('button', { name: 'View payment from aman to rahul' });
  await waitFor(() => expect(trigger).toHaveFocus());
  await userEvent.click(screen.getByRole('link', { name: 'Back to group' }));
  await waitFor(() => expect(requests.some((r) => r.path.endsWith('/balances/'))).toBe(true));
});
it('allows the receiver to confirm only after payment was marked as paid', async () => {
  actor = receiver; settlement.transactions[0].status = 'payment_reported';
  open(); const panel = await details();
  expect(screen.getByRole('region', { name: 'Action needed' })).toHaveTextContent('Confirm receipt from aman');
  await userEvent.click(panel.getByRole('button', { name: 'Confirm money received' }));
  expect(screen.getByText('Confirm that you received this money outside Splitter.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Confirm received outside the app' }));
  expect(await panel.findByText('Payment completed', { selector: 'strong' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Your payments' })).toHaveTextContent("You're all settled!");
  expect(requests.some((r) => r.path === `/transactions/${tid}/confirm/`)).toBe(true);
});
it.each([[receiver, 'pending'], [payer, 'payment_reported'], [payer, 'done'], [receiver, 'done']])('hides incorrect actions for actor %s and backend state %s', async (id, status) => {
  actor = id; settlement.transactions[0].status = status; open(); const panel = await details();
  expect(panel.queryByRole('button', { name: "I've paid" })).not.toBeInTheDocument();
  expect(panel.queryByRole('button', { name: 'Confirm money received' })).not.toBeInTheDocument();
});
it('never exposes UPI or mutation controls to unrelated members even when returned', async () => {
  actor = outsider; open(); const panel = await details();
  expect(document.body.textContent).not.toContain('rahul@bank');
  expect(panel.queryByRole('img')).not.toBeInTheDocument();
  expect(panel.queryByText('How to pay')).not.toBeInTheDocument();
  expect(panel.queryByRole('button', { name: "I've paid" })).not.toBeInTheDocument();
  expect(panel.queryByRole('button', { name: 'Confirm money received' })).not.toBeInTheDocument();
});
it('provides manual instructions and preserves URI validation', async () => {
  const item = settlement.transactions[0];
  for (const uri of ['javascript:alert(1)', 'https://evil.test', 'upi://pay?pa=rahul@bank&am=1.00&cu=INR', 'upi://pay?pa=rahul@bank&am=150.01&cu=INR&pin=1234']) expect(validPaymentUri({ upi_uri: uri, qr_available: true }, item.amount)).toBeNull();
  item.payment = { upi_uri: null, qr_available: false };
  open(); const panel = await details();
  expect(panel.getByText(/Ask the receiver how to pay/)).toBeInTheDocument(); expect(panel.queryByRole('img')).not.toBeInTheDocument();
});
it('shows INVALID_PAYMENT_STATE in focused details and refreshes without claiming success', async () => {
  handler = (path, method) => {
    if (method === 'POST') { settlement.transactions[0].status = 'payment_reported'; return json({ code: 'INVALID_PAYMENT_STATE', message: 'This payment action is not allowed in the current state.' }, 409); }
  };
  open(); const panel = await details(); await userEvent.click(panel.getByRole('button', { name: "I've paid" }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirm payment sent' }));
  expect(await panel.findByText('This payment action is not allowed in the current state.', { exact: false })).toBeInTheDocument();
  expect(await panel.findByText('Waiting for receiver to confirm', { selector: 'strong' })).toBeInTheDocument();
  expect(panel.queryByText(/Marked as paid. Waiting/)).not.toBeInTheDocument();
});
it('permits an explicit retry after a payment update outage', async () => {
  let down = true; handler = (path, method) => { if (method === 'POST' && down) throw new TypeError('offline'); };
  open(); const panel = await details(); await userEvent.click(panel.getByRole('button', { name: "I've paid" }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirm payment sent' }));
  expect(await panel.findByText(UNAVAILABLE_MESSAGE, { exact: false })).toBeInTheDocument();
  down = false; await userEvent.click(panel.getByRole('button', { name: "I've paid" }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirm payment sent' }));
  expect(await panel.findByText('Waiting for receiver to confirm', { selector: 'strong' })).toBeInTheDocument();
});
it('opens a payment row by keyboard and preserves the accessible full participant names', async () => {
  open(); const table = await screen.findByRole('list', { name: 'Group payments' });
  const row = within(table).getByRole('button', { name: 'View payment from aman to rahul' }); row.focus(); await userEvent.keyboard('{Enter}');
  expect(screen.getByRole('dialog', { name: 'Payment details' })).toBeInTheDocument();
  expect(row).toHaveAttribute('data-payment-id', tid);
  expect(row.querySelector('.compact-payment-status')).toHaveTextContent('Pending');
});
it('lists distinct personal actions without cancelling amounts or repeating them in the summary', async () => {
  settlement.transactions.push({ ...settlement.transactions[0], id: 'second', payer: { id: receiver, username: 'rahul' }, receiver: { id: payer, username: 'aman' }, amount: '20.00', status: 'payment_reported', payment: { upi_uri: null, qr_available: false } });
  open(); const attention = await screen.findByRole('region', { name: 'Action needed' });
  expect(attention).toHaveTextContent('Pay rahul');
  expect(attention).toHaveTextContent('Confirm receipt from rahul');
  expect(attention.querySelector('.payment-direction--outgoing')).toHaveTextContent('150.01');
  expect(attention.querySelector('.payment-direction--incoming')).toHaveTextContent('20.00');
  expect(within(attention).getAllByRole('button')).toHaveLength(2);
  expect(screen.queryByRole('region', { name: 'Your payments' })).not.toBeInTheDocument();
});

it('puts actions first, payments next, compact progress next, and instructions before payment actions', async () => {
  open();
  await screen.findByRole('list', { name: 'Group payments' });
  const headings = screen.getAllByRole('heading', { level: 2 });
  expect(headings.slice(0, 3).map((heading) => heading.textContent)).toEqual(['Action needed', 'Who pays whom', 'Payment progress']);
  expect(screen.queryByText('Next: complete payments')).not.toBeInTheDocument();
  const panel = await details();
  const instructions = panel.getByRole('region', { name: 'How to pay' });
  const action = panel.getByRole('button', { name: "I've paid" });
  const extra = panel.getByText('Details').closest('details');
  expect(instructions.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(action.compareDocumentPosition(extra) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(extra).not.toHaveAttribute('open');
});

it.each([[outsider, 'pending'], [payer, 'payment_reported'], [receiver, 'pending'], [receiver, 'done']])('does not show required actions for an informational or unrelated payment: %s %s', async (id, status) => {
  actor = id; settlement.transactions[0].status = status;
  open(); await screen.findByRole('list', { name: 'Group payments' });
  expect(screen.queryByRole('region', { name: 'Action needed' })).not.toBeInTheDocument();
  if (id === outsider) expect(screen.queryByRole('region', { name: 'Your payments' })).not.toBeInTheDocument();
});
it('keeps amounts and secondary breakdowns inside collapsed More details while statuses stay visible', async () => {
  open(); await screen.findByRole('list', { name: 'Group payments' });
  const extra = screen.getByText('More details').closest('details');
  expect(extra).not.toHaveAttribute('open');
  expect(within(extra).getByText(/Total to pay across the group/)).not.toBeVisible();
  expect(screen.getByRole('list', { name: 'Group payments' })).toHaveTextContent('Pending');
  await userEvent.click(screen.getByText('More details'));
  expect(within(extra).getByText(/Total to pay across the group/)).toBeVisible();
  expect(extra).toHaveTextContent('1 pending');
  expect(extra).toHaveTextContent('0 awaiting confirmation');
});
