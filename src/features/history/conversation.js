import { listExpenses } from '../../api/expenses.js';
import { listSettlements } from '../../api/settlements.js';

export async function allPages(load) {
  const rows = [];
  let result, page = 1;
  do {
    result = await load(page++);
    rows.push(...result.results);
  } while (result.next);
  return rows;
}

export function chronologicalExpenses(rows = []) {
  return [...rows].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function currentExpenses(expenses, settlements) {
  const completed = new Set(settlements.filter((item) => item.status === 'completed').map((item) => item.id));
  return chronologicalExpenses(expenses.filter((item) => !completed.has(item.settlement_id)));
}

export async function loadConversation(groupId, signal) {
  const [expenses, settlements] = await Promise.all([
    allPages((page) => listExpenses(groupId, page, '', signal)),
    allPages((page) => listSettlements(groupId, page, signal)),
  ]);
  return { results: currentExpenses(expenses, settlements), completed: settlements.some((item) => item.status === 'completed') };
}
