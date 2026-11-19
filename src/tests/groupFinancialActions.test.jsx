import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import GroupFinancialActions from '../features/balances/GroupFinancialActions.jsx';

const me = { id: 'a', username: 'aman' };
const other = { id: 'b', username: 'rahul' };
let balance, summaries, transactions, user, group;
const json = (data) => new Response(JSON.stringify(data), { status: 200 });
beforeEach(() => {
  user = me; group = { id: 'g', my_role: 'admin' };
  balance = { members: [{ user: me, net_balance: '0.00' }], unsettled_expense_total: '0.00', blockers: ['ACTIVE_SETTLEMENT_EXISTS'], can_generate_settlement: false };
  summaries = [{ id: 's', status: 'pending', transaction_count: 1 }];
  transactions = [{ id: 't', payer: me, receiver: other, amount: '250.00', status: 'pending' }];
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (url.endsWith('/balances/')) return json(balance);
    if (url.includes('/settlements/?')) return json({ results: summaries, count: summaries.length, next: null, previous: null });
    if (url === '/api/v1/settlements/s/') return json({ settlement: { id: 's', group_id: 'g', status: 'pending', transactions } });
    throw new Error(`Unexpected ${url}`);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function open() { render(<MemoryRouter><AuthContext.Provider value={{ user }}><GroupFinancialActions group={group} revision={0} onChanged={vi.fn()} onAdd={vi.fn()} /></AuthContext.Provider></MemoryRouter>); }

it('keeps authoritative named obligations and Add expense in the bottom action area', async () => {
  open();
  const footer = screen.getByRole('contentinfo', { name: 'Group actions' });
  expect(await within(footer).findByText(/You will pay rahul/)).toHaveTextContent('₹250.00');
  expect(within(footer).getByRole('link', { name: "I've paid" })).toHaveAttribute('href', '/groups/g/settlements/s?payment=t');
  const balanceSection = within(footer).getByRole('region', { name: 'Your balance' });
  const add = within(footer).getByRole('button', { name: 'Add an expense' });
  expect(balanceSection.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByText("You're all settled!")).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Generate settlement' })).not.toBeInTheDocument();
});
it('uses receiver wording and keeps confirmation separate from payment reporting', async () => {
  user = other; transactions[0].status = 'payment_reported'; open();
  expect(await screen.findByText(/marked.*as paid to you/)).toHaveTextContent('₹250.00');
  expect(screen.getByText('Waiting for confirmation')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Confirm money received' })).toHaveAttribute('href', '/groups/g/settlements/s?payment=t');
  expect(screen.queryByRole('link', { name: "I've paid" })).not.toBeInTheDocument();
});
it('summarizes multiple obligations without fabricating a net transfer', async () => {
  transactions.push({ ...transactions[0], id: 'second', receiver: { id: 'c', username: 'priya' } });
  open(); expect(await screen.findByText('You have 2 payments to review')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View official statement' })).toBeInTheDocument();
  expect(screen.queryByText('₹500.00')).not.toBeInTheDocument();
});
it('shows settled-up wording only after both preview and settlement state are known', async () => {
  summaries = []; balance.blockers = ['NO_UNSETTLED_EXPENSES']; open();
  expect(await screen.findByText("You're all settled!")).toBeInTheDocument();
});
it('keeps new unsettled amounts separate from an older pending settlement', async () => {
  balance.members[0].net_balance = '100.00'; open();
  expect(await screen.findByText(/From new expenses: You will receive/)).toHaveTextContent('₹100.00');
  expect(await screen.findByText(/You will pay rahul/)).toHaveTextContent('₹250.00');
  expect(screen.queryByText('₹150.00')).not.toBeInTheDocument();
});
it('does not allow generation when an active settlement contradicts an older eligible preview', async () => {
  balance.can_generate_settlement = true; balance.blockers = []; open();
  await screen.findByText(/You will pay rahul/);
  expect(screen.queryByRole('button', { name: 'Generate settlement' })).not.toBeInTheDocument();
});

it.each(['admin', 'member'])('links the current official statement for a %s without creating a settlement', async (role) => {
  group.my_role = role; open();
  expect(await screen.findByRole('link', { name: 'View official statement' })).toHaveAttribute('href', '/groups/g/settlements/s');
  expect(fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
});

it('hides an older completed statement from the current balance until a new settlement is generated', async () => {
  group.my_role = 'member'; summaries[0].status = 'completed';
  balance.members[0].net_balance = '-250.00';
  balance.blockers = []; balance.can_generate_settlement = true;
  open();
  await screen.findByText(/From new expenses: You will pay/);
  expect(screen.queryByRole('link', { name: 'View official statement' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: "I've paid" })).not.toBeInTheDocument();
});

it.each(['admin', 'member'])('hides the official statement before admin generation for a %s, even with a balance', async (role) => {
  group.my_role = role; summaries = [];
  balance.members[0].net_balance = '-250.00';
  balance.blockers = []; balance.can_generate_settlement = true;
  open();
  expect(screen.queryByRole('link', { name: 'View official statement' })).not.toBeInTheDocument();
  expect(await screen.findByText(/From new expenses: You will pay/)).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'View official statement' })).not.toBeInTheDocument();
  expect(fetch.mock.calls.some(([url]) => url === '/api/v1/settlements/s/')).toBe(false);
  expect(fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
});
