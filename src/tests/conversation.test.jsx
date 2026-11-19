import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RecentActivity from '../features/history/RecentActivity.jsx';
import { chronologicalExpenses, currentExpenses, loadConversation } from '../features/history/conversation.js';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const expense = (id, settlement_id = null) => ({ id, settlement_id, description: id, created_at: '2026-11-13T12:00:00Z', amount: '10.00', paid_by: { id: 'u', username: 'aman' } });
it('sorts creation time then UUID without changing input; retains pending and unknown assignments', () => {
  const rows = [expense('b', 'done'), expense('a', 'pending'), { ...expense('z'), created_at: '2026-11-12T12:00:00Z' }, expense('c', 'unknown')];
  expect(chronologicalExpenses(rows).map((item) => item.id)).toEqual(['z', 'a', 'b', 'c']);
  expect(currentExpenses(rows, [{ id: 'done', status: 'completed' }, { id: 'pending', status: 'pending' }]).map((item) => item.id)).toEqual(['z', 'a', 'c']);
  expect(rows[0].id).toBe('b');
});
it('reads every authoritative page, including zero-payment completed settlements, on reload', async () => {
  const mock = vi.fn(async (url) => new Response(JSON.stringify(url.includes('/expenses/') ? { results: [expense('old', 's'), expense('new')], next: null } : url.endsWith('page=1') ? { results: [{ id: 'p', status: 'pending' }], next: '?page=2' } : { results: [{ id: 's', status: 'completed', transaction_count: 0 }], next: null }), { status: 200 }));
  vi.stubGlobal('fetch', mock);
  expect((await loadConversation('g')).results.map((item) => item.id)).toEqual(['new']);
  expect((await loadConversation('g')).results.map((item) => item.id)).toEqual(['new']);
  expect(mock.mock.calls.some(([url]) => url.includes('settlements/?page=2'))).toBe(true);
});
it('opens at bottom, preserves older reading and provides a new-expenses jump', () => {
  const view = (rows) => <MemoryRouter><RecentActivity conversation groupId="g" expenses={{ data: { results: rows }, loading: false }} onExpense={() => {}} /></MemoryRouter>;
  const { rerender } = render(view([expense('a')]));
  const feed = screen.getByRole('region', { name: 'Group activity' });
  Object.defineProperties(feed, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { configurable: true, value: 200 } });
  feed.scrollTop = 0; fireEvent.scroll(feed);
  rerender(view([expense('a'), expense('b')]));
  expect(feed.scrollTop).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'New expenses ↓' }));
  expect(feed.scrollTop).toBe(1000);
  feed.scrollTop = 800; fireEvent.scroll(feed);
  rerender(view([expense('a'), expense('b'), expense('c')]));
  expect(feed.scrollTop).toBe(1000);
  expect(within(feed).getAllByRole('button').map((node) => node.textContent).join(' ')).toMatch(/a.*b.*c/);
});
