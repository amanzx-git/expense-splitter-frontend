import { selectOption } from './selectOption.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import GroupExpenses from '../features/expenses/GroupExpenses.jsx';
import { formatCalendarDate, localDateString } from '../utils/dates.js';
import { UNAVAILABLE_MESSAGE } from '../api/errors.js';

const owner = '123e4567-e89b-42d3-a456-426614174001';
const member = '123e4567-e89b-42d3-a456-426614174002';
const groupId = '123e4567-e89b-42d3-a456-426614174003';
const expenseId = '123e4567-e89b-42d3-a456-426614174004';
vi.mock('../hooks/useAuth.js', () => ({ useAuth: () => ({ user: { id: owner } }) }));
let group, expense, requests, handler, deleted, comments;
const page = (results, next = null, previous = null, count = results.length) => ({ results, next, previous, count });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => {
  document.cookie = 'csrftoken=f5; path=/';
  group = { id: groupId, name: 'Trip', my_role: 'admin' };
  expense = { id: expenseId, group_id: groupId, description: 'Dinner', amount: '1.01', paid_by: { id: member, username: 'rahul' }, created_by: { id: owner, username: 'aman' }, expense_date: '2026-11-13', settlement_id: null, shares: [{ user: { id: owner, username: 'aman' }, amount: '0.51' }, { user: { id: member, username: 'rahul' }, amount: '0.50' }], created_at: '2026-11-13T00:00:00Z' };
  requests = []; handler = null; deleted = false; comments = [];
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    const path = url.replace('/api/v1', '');
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ path, method: options.method, body, options });
    const custom = handler?.(path, options.method, body);
    if (custom) return custom;
    if (path.endsWith('/balances/')) return json({ group_id: groupId, currency: 'INR', unsettled_expense_total: deleted ? '0.00' : expense.amount, members: [], blockers: deleted ? ['NO_UNSETTLED_EXPENSES'] : [], can_generate_settlement: !deleted });
    if (path.includes('/settlements/?')) return json(page([]));
    if (path.includes('/members/')) {
      const second = path.endsWith('page=2');
      return json(page([{ id: second ? member : owner, role: second ? 'member' : 'admin', user: { id: second ? member : owner, full_name: second ? 'Rahul' : 'Aman', username: second ? 'rahul' : 'aman' } }], second ? null : '/api/v1/members/?page=2'));
    }
    if (path.includes('/comments/')) {
      if (options.method === 'POST') { comments.unshift({ id: crypto.randomUUID(), text: body.text, author: { id: owner, username: 'aman' }, created_at: expense.created_at }); return json({ comment: comments[0] }, 201); }
      return json(page(comments));
    }
    if (path === `/expenses/${expenseId}/`) {
      if (deleted) return json({ code: 'NOT_FOUND', message: 'Expense not found.' }, 404);
      if (options.method === 'DELETE') { deleted = true; return new Response(null, { status: 204 }); }
      if (options.method === 'PATCH') { Object.assign(expense, { description: body.description, amount: body.amount, expense_date: body.expense_date }); }
      return json({ expense });
    }
    if (options.method === 'POST') { Object.assign(expense, { description: body.description, amount: body.amount, expense_date: body.expense_date }); return json({ expense }, 201); }
    if (path.includes('/expenses/?')) return json(page(deleted ? [] : [expense]));
    throw new Error('Unexpected '+path);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function Location() { const navigate = useNavigate(); return <><output aria-label="Location">{useLocation().search}</output><button onClick={() => navigate(-1)}>Browser Back</button><button onClick={() => navigate(1)}>Browser Forward</button></>; }
function open(search = '', compact = false) {
  return render(<MemoryRouter initialEntries={[`/groups/${groupId}${search}`]}><GroupExpenses group={group} compact={compact} /><Location /></MemoryRouter>);
}
it('keeps the main group compact while retaining expense details and on-demand discussion', async () => {
  open('', true);
  expect(await screen.findByRole('region', { name: 'Group activity' })).toBeInTheDocument();
  await screen.findByRole('button', { name: 'Dinner' });
  expect(screen.queryByLabelText('Expense status')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Group comment')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Expense description')).not.toBeInTheDocument();
  expect(screen.queryByRole('list', { name: 'Member balances' })).not.toBeInTheDocument();
  expect(requests.some((request) => request.path.includes('/comments/'))).toBe(false);
  expect(screen.getByRole('link', { name: 'View history' })).toHaveAttribute('href', `/groups/${groupId}/history`);
  expect(within(screen.getByRole('contentinfo', { name: 'Group actions' })).queryByRole('button', { name: 'Group discussion' })).not.toBeInTheDocument();
  const panel = await detail();
  expect(panel.getByText('Dinner')).toBeInTheDocument();
});
it('opens an amount-first expense panel and preserves its draft across browser Back/Forward', async () => {
  open('', true);
  await userEvent.click(screen.getByRole('button', { name: 'Add an expense' }));
  const amount = await screen.findByLabelText('Amount (INR)');
  expect([...document.querySelector('dialog[open] form').querySelectorAll('input')][0]).toBe(amount);
  await userEvent.type(amount, '120.50');
  await userEvent.type(screen.getByLabelText('Expense description'), 'Saved draft');
  await userEvent.click(screen.getByRole('button', { name: 'Browser Back' }));
  expect(screen.queryByLabelText('Amount (INR)')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Browser Forward' }));
  expect(await screen.findByLabelText('Amount (INR)')).toHaveValue('120.50');
  expect(screen.getByLabelText('Expense description')).toHaveValue('Saved draft');
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByLabelText('Amount (INR)')).not.toBeInTheDocument();
  expect(requests.some((request) => request.method === 'POST')).toBe(false);
});
it('returns a saved expense to the conversation once, opens details only on click and closes safely', async () => {
  open('', true);
  await userEvent.click(screen.getByRole('button', { name: 'Add an expense' }));
  await userEvent.type(await screen.findByLabelText('Amount (INR)'), '120.50');
  await selectOption(screen.getByLabelText('Paid by'), owner);
  await userEvent.type(screen.getByLabelText('Expense description'), 'Lunch');
  await userEvent.click(screen.getByRole('button', { name: 'Add expense' }));
  expect(await screen.findByText('Expense added to the group.')).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'Lunch' })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Lunch' })).toHaveLength(1);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(requests.some((request) => request.path === `/expenses/${expenseId}/`)).toBe(false);
  expect(screen.queryByText('Shared cost · not a money transfer')).not.toBeInTheDocument();
  for (const closeLabel of ['Close expense details']) {
    await userEvent.click(screen.getByRole('button', { name: 'Lunch' }));
    const dialog = within(screen.getByRole('dialog'));
    await dialog.findByRole('heading', { name: 'Shared by 2 people' });
    await userEvent.click(dialog.getByRole('button', { name: closeLabel }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lunch' })).toBeInTheDocument();
  }
  expect(requests.some((request) => request.method === 'DELETE')).toBe(false);
});
async function detail() {
  await userEvent.click(await screen.findByRole('button', { name: 'Dinner' }));
  const dialog = screen.getByRole('dialog');
  await within(dialog).findByRole('heading', { name: 'Shared by 2 people' });
  return within(dialog);
}
it('lists dates, participants and statuses and filters before pagination', async () => {
  handler = (path) => {
    if (path.includes('/expenses/?page=1&status=unsettled')) return json(page([expense], '?page=2', null, 21));
    if (path.includes('/expenses/?page=2')) return json(page([{ ...expense, description: 'Page two' }], null, '?page=1', 21));
  };
  open();
  expect(await screen.findByText('Participants: @aman, @rahul')).toBeInTheDocument();
  expect(screen.getByText(formatCalendarDate('2026-11-13'))).toHaveAttribute('dateTime', '2026-11-13');
  await userEvent.click(within(screen.getByRole('navigation', { name: 'Pagination' })).getByRole('button', { name: 'Next' }));
  expect(await screen.findByRole('button', { name: 'Page two' })).toBeInTheDocument();
  await selectOption(screen.getByLabelText('Expense status'), 'settled');
  await waitFor(() => expect(requests.some((r) => r.path.endsWith('page=1&status=settled'))).toBe(true));
});
it('loads every member page, previews exact shares and normalizes create payload', async () => {
  open(); await userEvent.click(screen.getByRole('button', { name: 'New expense' }));
  const description = await screen.findByLabelText('Expense description');
  expect(screen.getByLabelText('Rahul (@rahul)')).toBeChecked();
  expect(requests.some((r) => r.path.includes('members/?page=2'))).toBe(true);
  expect(screen.getByLabelText('Expense date')).toHaveValue(localDateString());
  await userEvent.type(description, ' Lunch ');
  await userEvent.type(screen.getByLabelText('Amount (INR)'), '120.5');
  await selectOption(screen.getByLabelText('Paid by'), owner);
  await userEvent.clear(screen.getByLabelText('Expense date'));
  await userEvent.type(screen.getByLabelText('Expense date'), '2026-11-13');
  expect(screen.getByRole('heading', { name: 'Estimated shares' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Add expense' }));
  await screen.findByRole('heading', { name: 'Shared by 2 people' });
  const request = requests.find((r) => r.method === 'POST' && r.path.endsWith('/expenses/'));
  expect(request.body).toEqual({ description: 'Lunch', amount: '120.50', paid_by: owner, participant_ids: [owner, member], expense_date: '2026-11-13' });
  expect(request.options.headers['X-CSRFToken']).toBe('f5');
  expect(request.options.credentials).toBe('include');
  await waitFor(() => expect(requests.filter((r) => r.path.endsWith('/balances/')).length).toBeGreaterThan(1));
});
it('rejects invalid money and empty participant selection without posting', async () => {
  open(); await userEvent.click(screen.getByRole('button', { name: 'New expense' }));
  await userEvent.type(await screen.findByLabelText('Expense description'), 'Lunch');
  await userEvent.type(screen.getByLabelText('Amount (INR)'), '1.001');
  await selectOption(screen.getByLabelText('Paid by'), owner);
  await userEvent.click(screen.getByLabelText('Aman (@aman)')); await userEvent.click(screen.getByLabelText('Rahul (@rahul)'));
  await userEvent.click(screen.getByRole('button', { name: 'Add expense' }));
  expect(screen.getByText(/Use at most two decimal places/)).toBeInTheDocument();
  expect(screen.getByText(/Select at least one person/)).toBeInTheDocument();
  expect(requests.some((r) => r.method === 'POST')).toBe(false);
});
it('opens detail via query, keeps saved shares authoritative and restores opener focus', async () => {
  open(); const button = await screen.findByRole('button', { name: 'Dinner' });
  await userEvent.click(button);
  const dialog = within(screen.getByRole('dialog'));
  await dialog.findByText('@aman');
  expect(screen.getByLabelText('Location')).toHaveTextContent(`expense=${expenseId}`);
  await userEvent.click(dialog.getByRole('button', { name: 'Close expense details' }));
  await waitFor(() => expect(button).toHaveFocus());
  expect(screen.getByLabelText('Location')).toBeEmptyDOMElement();
});
it('keeps amount, payer and shares primary while collapsing secondary metadata', async () => {
  open(); const dialog = await detail();
  expect(dialog.getByText('@aman').closest('details')).toBeNull();
  expect(dialog.getByText('Paid by @rahul').closest('details')).toBeNull();
  const metadata = dialog.getByText('More details').closest('details');
  expect(metadata).not.toHaveAttribute('open');
  expect(within(metadata).getByText('Added by: @aman')).toBeInTheDocument();
  expect(within(metadata).queryByText(/Expense reference:/)).not.toBeInTheDocument();
  expect(dialog.queryByRole('button', { name: 'Back to group' })).not.toBeInTheDocument();
  expect(dialog.getByRole('button', { name: 'Close expense details' })).toBeInTheDocument();
});
it('renders three separate participant rows with exact saved amounts and truncatable names', async () => {
  expense.shares = [
    { user: { id: owner, username: 'aman' }, amount: '166.67' },
    { user: { id: member, username: 'eren' }, amount: '166.67' },
    { user: { id: 'third', username: 'a_very_long_member_username_123' }, amount: '166.66' },
  ];
  open(); await userEvent.click(await screen.findByRole('button', { name: 'Dinner' }));
  const list = await screen.findByRole('list', { name: 'Participant shares' });
  const rows = within(list).getAllByRole('listitem');
  expect(rows).toHaveLength(3);
  rows.forEach((row) => { expect(row).toHaveClass('expense-share-row'); expect(row.querySelectorAll('.user-avatar')).toHaveLength(1); expect(row.querySelectorAll('.money')).toHaveLength(1); });
  expect(rows.map((row) => row.querySelector('.money').textContent)).toEqual(['₹166.67', '₹166.67', '₹166.66']);
  expect(within(rows[2]).getByTitle('@a_very_long_member_username_123')).toHaveClass('expense-share-name');
  expect(list.closest('details')).toBeNull();
});
it('supports direct deep links and denies cross-group details', async () => {
  expense.group_id = member;
  open(`?expense=${expenseId}`);
  expect(await screen.findByText('Expense not found in this group.')).toBeInTheDocument();
  expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Edit expense' })).not.toBeInTheDocument();
  expect(requests.some((r) => r.path.startsWith(`/expenses/${expenseId}/comments/`))).toBe(false);
});
it('never offers saved-expense editing, including to admins', async () => {
  expense.paid_by = { id: owner, username: 'aman' };
  open(); const dialog = await detail();
  expect(dialog.queryByRole('button', { name: 'Edit expense' })).not.toBeInTheDocument();
  expect(dialog.getByRole('button', { name: 'Delete expense' })).toBeInTheDocument();
});
it.each(['settled', 'other payer'])('hides mutation buttons for %s while allowing comments', async (condition) => {
  if (condition === 'settled') { expense.paid_by = { id: owner, username: 'aman' }; expense.settlement_id = member; }
  open(); const dialog = await detail();
  expect(dialog.queryByRole('button', { name: 'Edit expense' })).not.toBeInTheDocument();
  expect(dialog.queryByRole('button', { name: 'Delete expense' })).not.toBeInTheDocument();
  expect(await dialog.findByLabelText('Expense comment')).toBeInTheDocument();
});
it('requires deletion confirmation and removes expense after 204', async () => {
  expense.paid_by = { id: owner, username: 'aman' };
  open(); const dialog = await detail();
  await userEvent.click(dialog.getByRole('button', { name: 'Delete expense' }));
  expect(requests.some((r) => r.method === 'DELETE')).toBe(false);
  await userEvent.click(dialog.getByRole('button', { name: 'Keep expense' }));
  await userEvent.click(dialog.getByRole('button', { name: 'Delete expense' }));
  await userEvent.click(dialog.getByRole('button', { name: 'Confirm delete' }));
  expect(await screen.findByText('No expenses yet')).toBeInTheDocument();
  await waitFor(() => expect(requests.filter((r) => r.path.endsWith('/balances/')).length).toBeGreaterThan(1));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
it('posts immutable expense and group comments using separate endpoints', async () => {
  open();
  await userEvent.type(await screen.findByLabelText('Group comment'), 'Hello group');
  await userEvent.click(screen.getByRole('button', { name: 'Post comment' }));
  await screen.findByText('Hello group');
  const dialog = await detail();
  await userEvent.type(await dialog.findByLabelText('Expense comment'), ' Dinner note ');
  await userEvent.click(dialog.getByRole('button', { name: 'Post comment' }));
  expect(await dialog.findByText('Dinner note')).toBeInTheDocument();
  expect(requests.find((r) => r.path === `/expenses/${expenseId}/comments/` && r.method === 'POST').body).toEqual({ text: 'Dinner note' });
  expect(dialog.queryByRole('button', { name: 'Edit comment' })).not.toBeInTheDocument();
});
it('preserves form entries and displays the existing outage message', async () => {
  open(); await userEvent.click(screen.getByRole('button', { name: 'New expense' }));
  await userEvent.type(await screen.findByLabelText('Expense description'), 'Lunch');
  await userEvent.type(screen.getByLabelText('Amount (INR)'), '10');
  await selectOption(screen.getByLabelText('Paid by'), owner);
  handler = (path, method) => { if (method === 'POST') throw new TypeError('offline'); };
  await userEvent.click(screen.getByRole('button', { name: 'Add expense' }));
  expect(await screen.findByText(UNAVAILABLE_MESSAGE, { exact: false })).toBeInTheDocument();
  expect(screen.getByLabelText('Expense description')).toHaveValue('Lunch');
});
it('shows empty, forbidden and retryable loading failures', async () => {
  handler = (path) => path.includes('/expenses/?') ? json({ code: 'PERMISSION_DENIED', message: 'Group access denied.' }, 403) : null;
  open();
  expect(await screen.findByText('Group access denied.')).toBeInTheDocument();
  handler = (path) => path.includes('/expenses/?') ? json(page([])) : null;
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('No expenses yet')).toBeInTheDocument();
});

it('does not grant deletion to an admin creator who is not the payer', async () => {
  open(); const dialog = await detail();
  expect(dialog.queryByRole('button', { name: 'Delete expense' })).not.toBeInTheDocument();
});
it('allows a payer to delete an eligible expense recorded by someone else', async () => {
  group.my_role = 'member';
  expense.paid_by = { id: owner, username: 'aman' };
  expense.created_by = { id: member, username: 'rahul' };
  open(); const dialog = await detail();
  expect(dialog.getByRole('button', { name: 'Delete expense' })).toBeInTheDocument();
  expect(dialog.queryByRole('button', { name: 'Edit expense' })).not.toBeInTheDocument();
});
it('keeps the expense visible and shows the backend permission error when deletion is denied', async () => {
  expense.paid_by = { id: owner, username: 'aman' };
  handler = (path, method) => method === 'DELETE' ? json({ code: 'PERMISSION_DENIED', message: 'Only the expense payer can delete this expense.' }, 403) : null;
  open(); const dialog = await detail();
  await userEvent.click(dialog.getByRole('button', { name: 'Delete expense' }));
  await userEvent.click(dialog.getByRole('button', { name: 'Confirm delete' }));
  expect(await dialog.findByText('Only the expense payer can delete this expense.', { exact: false })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Dinner' })).toBeInTheDocument();
  expect(deleted).toBe(false);
});
it('omits payer selection and payer input for ordinary members', async () => {
  group.my_role = 'member';
  open(); await userEvent.click(screen.getByRole('button', { name: 'New expense' }));
  await userEvent.type(await screen.findByLabelText('Amount (INR)'), '500');
  await userEvent.type(screen.getByLabelText('Expense description'), 'My expense');
  expect(screen.queryByLabelText('Paid by')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Add expense' }));
  await waitFor(() => expect(requests.some((r) => r.method === 'POST')).toBe(true));
  expect(requests.find((r) => r.method === 'POST').body).not.toHaveProperty('paid_by');
});
it('defaults an admin payer to self and submits a distinct selected payer', async () => {
  open(); await userEvent.click(screen.getByRole('button', { name: 'New expense' }));
  const payerSelect = await screen.findByLabelText('Paid by');
  expect(payerSelect).toHaveValue(owner);
  await selectOption(payerSelect, member);
  await userEvent.type(screen.getByLabelText('Amount (INR)'), '700');
  await userEvent.type(screen.getByLabelText('Expense description'), 'Rahul paid');
  await userEvent.click(screen.getByRole('button', { name: 'Add expense' }));
  await waitFor(() => expect(requests.some((r) => r.method === 'POST')).toBe(true));
  expect(requests.find((r) => r.method === 'POST').body.paid_by).toBe(member);
});
it('hides comments and mutation forms for deleted detail links', async () => {
  deleted = true;
  open(`?expense=${expenseId}`);
  expect(await screen.findByText('Expense not found.')).toBeInTheDocument();
  expect(within(screen.getByRole('dialog')).queryByLabelText('Expense comment')).not.toBeInTheDocument();
});
