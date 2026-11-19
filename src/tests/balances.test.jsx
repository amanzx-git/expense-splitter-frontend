import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import GroupExpenses from '../features/expenses/GroupExpenses.jsx';
import GroupBalances from '../features/balances/GroupBalances.jsx';
import { UNAVAILABLE_MESSAGE } from '../api/errors.js';
import { AuthContext } from '../context/AuthContext.jsx';

const groupId = '123e4567-e89b-42d3-a456-426614174000';
let data, fetchMock;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => {
  data = { group_id: groupId, currency: 'INR', unsettled_expense_total: '1200.01', members: [
    { user: { id: '123e4567-e89b-42d3-a456-426614174001', username: 'aman' }, net_balance: '600.01' },
    { user: { id: '123e4567-e89b-42d3-a456-426614174002', username: 'rahul' }, net_balance: '-600.01' },
    { user: { id: '123e4567-e89b-42d3-a456-426614174003', username: 'priya' }, net_balance: '0.00' },
  ], blockers: [], can_generate_settlement: true };
  fetchMock = vi.fn(async () => json(data));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it.each([[0, 'You will receive', '600.01'], [1, 'You will pay', '600.01'], [2, 'No payments from new expenses', '0.00']])('uses accurate compact balance language for member %s', async (index, wording, amount) => {
  render(<AuthContext.Provider value={{ user: data.members[index].user }}><GroupBalances groupId={groupId} compact /></AuthContext.Provider>);
  const line = await screen.findByText(new RegExp(wording));
  expect(line).toHaveTextContent(new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount));
  expect(screen.queryByRole('list', { name: 'Member balances' })).not.toBeInTheDocument();
});

it('renders compact accurate balances and directions without settlement actions', async () => {
  render(<GroupBalances groupId={groupId} isAdmin />);
  expect(screen.getByRole('status')).toBeInTheDocument();
  expect(await screen.findByText('@aman')).toBeInTheDocument();
  expect(screen.queryByText(/Estimates for new expenses/)).not.toBeInTheDocument();
  const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
  expect(screen.getByText(money.format('1200.01'))).toBeInTheDocument();
  const rows = within(screen.getByRole('list', { name: 'Member balances' })).getAllByRole('listitem');
  expect(rows[0]).toHaveTextContent('Will receive '+money.format('600.01'));
  expect(rows[1]).toHaveTextContent('Will pay '+money.format('600.01'));
  expect(rows[2]).toHaveTextContent('Settled');
  expect(rows[0].querySelector('.money')).toHaveClass('payment-direction--incoming');
  expect(rows[1].querySelector('.money')).toHaveClass('payment-direction--outgoing');
  expect(rows[2].querySelector('.money')).toBeNull();
  expect(screen.getByText('Ready to settle')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(fetchMock.mock.calls[0][0]).toBe(`/api/v1/groups/${groupId}/balances/`);
  expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
});
it('shows just one blocker explanation', async () => {
  data.blockers = ['PENDING_INVITATIONS', 'ACTIVE_SETTLEMENT_EXISTS'];
  data.can_generate_settlement = false;
  render(<GroupBalances groupId={groupId} isAdmin />);
  expect(await screen.findByText(/Resolve pending invitations/)).toBeInTheDocument();
  expect(screen.queryByText(/Finish current payments/)).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Ready to settle up?' })).not.toBeInTheDocument();
});
it('keeps zero-net expenses distinct from an empty expense pool', async () => {
  data.members.forEach((m) => { m.net_balance = '0.00'; });
  render(<GroupBalances groupId={groupId} isAdmin />);
  await screen.findByText('@aman');
  expect(screen.queryByRole('heading', { name: 'No new expenses' })).not.toBeInTheDocument();
  expect(screen.getByText('Ready to settle')).toBeInTheDocument();
});
it('keeps an empty expense pool minimal even with members and an older active settlement', async () => {
  data.unsettled_expense_total = '0.00'; data.blockers = ['NO_UNSETTLED_EXPENSES', 'ACTIVE_SETTLEMENT_EXISTS'];
  const onAdd = vi.fn();
  render(<GroupBalances groupId={groupId} inModal onAdd={onAdd} />);
  expect(await screen.findByRole('heading', { name: 'No new expenses' })).toBeInTheDocument();
  expect(screen.getByText('Add an expense to see who needs to pay.')).toBeInTheDocument();
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
  expect(document.querySelector('.money')).toBeNull();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(document.querySelector('.group-balances')).not.toHaveClass('card');
  await userEvent.click(screen.getByRole('button', { name: 'Add an expense' }));
  expect(onAdd).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('uses a short fallback for unknown blockers', async () => {
  data.blockers = ['NEW_BLOCKER']; data.can_generate_settlement = false;
  render(<GroupBalances groupId={groupId} isAdmin />);
  expect(await screen.findByText('Cannot settle yet. Try refreshing.')).toBeInTheDocument();
});
it('does not offer settlement eligibility to non-admins', async () => {
  render(<GroupBalances groupId={groupId} />);
  await screen.findByText('@aman');
  expect(screen.queryByText('Ready to settle')).not.toBeInTheDocument();
});
it('links only the current active official statement without mixing its payments into balances', async () => {
  data.blockers = ['ACTIVE_SETTLEMENT_EXISTS']; data.can_generate_settlement = false;
  fetchMock.mockImplementation(async (url) => json(url.includes('/settlements/') ? { results: [{ id: 'current', status: 'pending' }] } : data));
  render(<MemoryRouter><GroupBalances groupId={groupId} inModal /></MemoryRouter>);
  expect(await screen.findByRole('link', { name: 'View official statement' })).toHaveAttribute('href', `/groups/${groupId}/settlements/current`);
  expect(screen.getByRole('list', { name: 'Member balances' }).children).toHaveLength(3);
  expect(screen.queryByText('Who pays whom')).not.toBeInTheDocument();
});
it('uses existing outage handling and Retry to recover', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('offline'));
  render(<GroupBalances groupId={groupId} isAdmin />);
  expect(await screen.findByText(UNAVAILABLE_MESSAGE, { exact: false })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('@aman')).toBeInTheDocument();
});
it('shows authorization failures without exposing balances', async () => {
  fetchMock.mockResolvedValueOnce(json({ code: 'NOT_FOUND', message: 'Group not found.' }, 404));
  render(<GroupBalances groupId={groupId} isAdmin />);
  expect(await screen.findByText('Group not found.')).toBeInTheDocument();
  expect(screen.queryByText('@aman')).not.toBeInTheDocument();
});
it('refreshes server amounts when the mutation revision changes', async () => {
  const view = render(<GroupBalances groupId={groupId} revision={0} />);
  await screen.findByText('@aman');
  data.unsettled_expense_total = '5.01';
  view.rerender(<GroupBalances groupId={groupId} revision={1} />);
  const formatted = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format('5.01');
  expect(await screen.findByText(formatted)).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('replaces the balances modal with the expense flow and closes back to the group', async () => {
  data.unsettled_expense_total = '0.00'; data.blockers = ['NO_UNSETTLED_EXPENSES'];
  fetchMock.mockImplementation(async (url) => {
    if (url.includes('/balances/')) return json(data);
    return json({ results: [], count: 0, next: null, previous: null });
  });
  render(<AuthContext.Provider value={{ user: data.members[0].user }}><MemoryRouter initialEntries={[`/groups/${groupId}?panel=balances`]}><GroupExpenses group={{ id: groupId, my_role: 'member' }} compact /></MemoryRouter></AuthContext.Provider>);
  const modal = await screen.findByRole('dialog', { name: 'Group balances' });
  expect(within(modal).getByRole('button', { name: 'Close group balances' })).toBeInTheDocument();
  await userEvent.click(await within(modal).findByRole('button', { name: 'Add an expense' }));
  const form = await screen.findByRole('dialog', { name: 'Add expense' });
  expect(screen.queryByRole('dialog', { name: 'Group balances' })).not.toBeInTheDocument();
  await userEvent.click(within(form).getByRole('button', { name: 'Close add expense' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
