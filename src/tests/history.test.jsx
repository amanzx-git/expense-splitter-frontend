import { selectOption } from './selectOption.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GroupHistoryPage from '../pages/GroupHistoryPage.jsx';
import RecentActivity from '../features/history/RecentActivity.jsx';
import { newestExpenses, paymentEvents } from '../features/history/activity.js';
import { AuthContext } from '../context/AuthContext.jsx';
import PaymentEvents from '../features/history/PaymentEvents.jsx';

const groupId = 'group';
const payer = { id: 'payer', username: 'aman' };
const receiver = { id: 'receiver', username: 'rahul' };
const transaction = { id: 't', payer, receiver, amount: '50.01', status: 'done', reported_at: '2026-11-12T08:00:00Z', confirmed_at: '2026-11-13T09:00:00Z' };
const expense = (id, at) => ({ id, description: `Expense ${id}`, paid_by: payer, amount: '100.01', created_at: at, settlement_id: null });
const page = (results, next = null) => ({ results, next, previous: null, count: results.length });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
let expenses, summaries, denied, requests;
beforeEach(() => {
  expenses = [expense('old', '2026-11-12T10:00:00Z'), expense('new', '2026-11-13T10:00:00Z')];
  summaries = [{ id: 's', sequence_number: 1, group_id: groupId, created_at: '2026-11-12T00:00:00Z', status: 'completed', transaction_count: 1, confirmed_transaction_count: 1, expense_count: 1, total_transfer_amount: '50.01' }];
  denied = false; requests = [];
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    requests.push(url);
    if (url === '/api/v1/groups/group/') return denied ? json({ code: 'NOT_FOUND', message: 'Not found.' }, 404) : json({ group: { name: 'Trip', id: groupId } });
    if (url.includes('/expenses/?')) return json(page(url.includes('page=2') ? [expense('second', '2026-11-10T00:00:00Z')] : expenses, url.includes('page=2') ? null : '?page=2'));
    if (url.includes('/settlements/?')) return json(page(summaries));
    if (url === '/api/v1/settlements/s/') return json({ settlement: { id: 's', group_id: groupId, status: 'completed', transactions: [transaction] } });
    throw new Error(`Unexpected ${url}`);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function openHistory() { render(<MemoryRouter initialEntries={['/groups/group/history']}><Routes><Route path="/groups/:groupId/history" element={<GroupHistoryPage />} /></Routes></MemoryRouter>); }
it('provides keyboard-operated history tabs with independent visible panels', async () => {
  openHistory();
  const expensesTab = await screen.findByRole('tab', { name: 'Expenses' });
  expect(screen.getByRole('tabpanel', { name: 'Expenses' })).toBeVisible();
  expensesTab.focus(); await userEvent.keyboard('{ArrowRight}');
  expect(screen.getByRole('tab', { name: 'Settlements' })).toHaveFocus();
  expect(screen.getByRole('tabpanel', { name: 'Settlements' })).toBeVisible();
  expect(screen.queryByRole('region', { name: 'Expense history' })).not.toBeInTheDocument();
  await userEvent.keyboard('{End}');
  expect(screen.getByRole('tabpanel', { name: 'Payments' })).toBeVisible();
  await userEvent.keyboard('{Home}');
  expect(expensesTab).toHaveAttribute('aria-selected', 'true');
});

it('keeps completed expenses accessible separately from new and pending-settlement expenses', async () => {
  expenses[0].settlement_id = 's';
  expenses[1].settlement_id = 'pending';
  openHistory();
  await userEvent.click(await screen.findByRole('tab', { name: 'Settlements' }));
  expect(await screen.findByRole('link', { name: 'Settlement #1' })).toHaveAttribute('href', '/groups/group/settlements/s');
  await userEvent.click(screen.getByRole('tab', { name: 'Expenses' }));
  expect(screen.getByRole('link', { name: 'Expense old' }).closest('.history-expense-row')).toHaveClass('history-expense-row--archived');
  expect(screen.getByRole('link', { name: 'Expense new' }).closest('.history-expense-row')).not.toHaveClass('history-expense-row--archived');
  expect(screen.getByText('Completed', { selector: '.archived-label' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Only expenses from completed settlements' }));
  const section = screen.getByRole('region', { name: 'Expense history' });
  expect(await within(section).findByRole('link', { name: 'Expense old' })).toHaveAttribute('href', '/groups/group?expense=old');
  expect(within(section).queryByRole('link', { name: 'Expense new' })).not.toBeInTheDocument();
  expect(within(section).getByText(/Completed expenses cannot be changed/)).toBeInTheDocument();
});

it('orders exact recorded transitions, excludes pending obligations and does not mutate expenses', () => {
  const original = [...expenses];
  expect(newestExpenses(expenses).map((item) => item.id)).toEqual(['new', 'old']);
  expect(expenses).toEqual(original);
  const events = paymentEvents([transaction, { ...transaction, id: 'pending', reported_at: null, confirmed_at: null }]);
  expect(events.map((event) => event.id)).toEqual(['t:confirmed', 't:reported']);
  expect(events.map((event) => event.user.id)).toEqual(['receiver', 'payer']);
  expect(events.map((event) => event.amount)).toEqual(['50.01', '50.01']);
});
it('paginates expenses, preserves detail routes and loads payment details only on demand', async () => {
  openHistory();
  const section = await screen.findByRole('region', { name: 'Expense history' });
  expect((await within(section).findAllByRole('link')).map((link) => link.textContent)).toEqual(['Expense new', 'Expense old']);
  expect(screen.getByRole('link', { name: 'Expense new' })).toHaveAttribute('href', '/groups/group?expense=new');
  expect(requests).not.toContain('/api/v1/settlements/s/');
  await userEvent.click(screen.getByRole('tab', { name: 'Payments' }));
  await userEvent.click(screen.getByRole('button', { name: 'Show payments for settlement #1' }));
  expect(await screen.findByText('Payment completed')).toBeInTheDocument();
  expect(screen.queryByText(/marked a payment as paid to/)).not.toBeInTheDocument();
  expect(requests.filter((url) => url === '/api/v1/settlements/s/')).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'View settlement details' })).toHaveAttribute('href', '/groups/group/settlements/s');
  await userEvent.click(screen.getByRole('tab', { name: 'Expenses' }));
  await userEvent.click(within(section).getByRole('button', { name: 'Next' }));
  expect(await screen.findByRole('link', { name: 'Expense second' })).toBeInTheDocument();
  await selectOption(screen.getByLabelText('Expense status'), 'settled');
  expect(requests.some((url) => url.endsWith('expenses/?page=1&status=settled'))).toBe(true);
});
it('shows empty history without inventing transactions', async () => {
  expenses = []; summaries = [];
  openHistory();
  expect(await screen.findByText('No expense history yet')).toBeInTheDocument();
  expect(await screen.findByText('No payment history yet')).toBeInTheDocument();
});
it('does not fetch financial history when group access is denied', async () => {
  denied = true; openHistory();
  expect(await screen.findByText('Not found.')).toBeInTheDocument();
  expect(requests).toEqual(['/api/v1/groups/group/']);
});
it('limits recent expenses and points to full history without per-user requests', async () => {
  expenses = Array.from({ length: 6 }, (_, index) => expense(String(index), `2026-11-${String(index + 1).padStart(2, '0')}T00:00:00Z`));
  const onExpense = vi.fn();
  render(<MemoryRouter><RecentActivity groupId={groupId} expenses={{ data: page(expenses) }} revision={0} onExpense={onExpense} /></MemoryRouter>);
  expect(screen.getAllByRole('button')).toHaveLength(3);
  await userEvent.click(screen.getByRole('button', { name: 'Expense 5' }));
  expect(onExpense.mock.calls[0][0]).toBe('5');
  expect(screen.getByRole('link', { name: 'View history' })).toHaveAttribute('href', '/groups/group/history');
  await screen.findByText(/confirmed a payment from/);
  expect(requests).toEqual(['/api/v1/groups/group/settlements/?page=1', '/api/v1/settlements/s/']);
});
it('shows personal pending instructions and preserves payer/receiver confirmation boundaries', async () => {
  let status = 'pending';
  vi.stubGlobal('fetch', vi.fn(async () => json({ settlement: { group_id: groupId, status: 'pending', transactions: [{ ...transaction, status, reported_at: status === 'pending' ? null : transaction.reported_at, confirmed_at: null }] } })));
  const view = render(<AuthContext.Provider value={{ user: payer }}><MemoryRouter><PaymentEvents groupId={groupId} settlementId="s" instructions /></MemoryRouter></AuthContext.Provider>);
  expect(await screen.findByText(/You will pay rahul/)).toHaveTextContent('₹50.01');
  expect(screen.getByRole('link', { name: "I've paid" })).toHaveAttribute('href', '/groups/group/settlements/s');
  expect(screen.queryByRole('link', { name: 'Confirm money received' })).not.toBeInTheDocument();
  view.unmount(); status = 'payment_reported';
  render(<AuthContext.Provider value={{ user: receiver }}><MemoryRouter><PaymentEvents groupId={groupId} settlementId="s" instructions /></MemoryRouter></AuthContext.Provider>);
  expect(await screen.findByText(/marked.*as paid to you/)).toHaveTextContent('₹50.01');
  expect(screen.getByText('Confirm the money arrived')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Confirm money received' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: "I've paid" })).not.toBeInTheDocument();
});
it('aligns expenses by payer identity independently of creator', () => {
  const rows = [
    { ...expense('own', '2026-11-13T00:00:00Z'), created_by: payer, paid_by: receiver },
    { ...expense('other', '2026-11-12T00:00:00Z'), created_by: receiver, paid_by: payer },
    expense('unknown', '2026-11-11T00:00:00Z'),
  ];
  render(<AuthContext.Provider value={{ user: payer }}><MemoryRouter><RecentActivity groupId={groupId} expenses={{ data: page(rows) }} revision={0} onExpense={vi.fn()} conversation /></MemoryRouter></AuthContext.Provider>);
  expect(screen.getByRole('button', { name: 'Expense own' }).closest('li')).not.toHaveClass('expense-message-row--own');
  expect(screen.getByRole('button', { name: 'Expense other' }).closest('li')).toHaveClass('expense-message-row--own');
  expect(screen.getByRole('button', { name: 'Expense unknown' }).closest('li')).toHaveClass('expense-message-row--own');
  expect(screen.queryByText('Added by You')).not.toBeInTheDocument();
});
it.each([['admin', false], ['rahul', true], ['aman', false]])('aligns an admin-recorded Rahul expense correctly for %s', (viewer, own) => {
  const assigned = { ...expense('assigned', '2026-11-13T00:00:00Z'), created_by: { id: 'admin', username: 'admin' }, paid_by: { id: 'rahul', username: 'rahul' } };
  render(<AuthContext.Provider value={{ user: { id: viewer } }}><MemoryRouter><RecentActivity groupId={groupId} expenses={{ data: page([assigned]) }} onExpense={vi.fn()} conversation /></MemoryRouter></AuthContext.Provider>);
  const card = screen.getByRole('button', { name: 'Expense assigned' });
  expect(card.closest('li').classList.contains('expense-message-row--own')).toBe(own);
  expect(card).toHaveTextContent('@rahul paid');
});
