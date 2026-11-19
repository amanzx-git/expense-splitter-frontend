import { api } from './client.js';
import { getMembers } from './groups.js';

export const listExpenses = (groupId, page, status, signal) => api.get(`/groups/${groupId}/expenses/?page=${page}${status ? `&status=${status}` : ''}`, { signal });
export const getExpense = (id, signal) => api.get(`/expenses/${id}/`, { signal });
export const createExpense = (groupId, body) => api.post(`/groups/${groupId}/expenses/`, body);
export const updateExpense = (id, body) => api.patch(`/expenses/${id}/`, body);
export const deleteExpense = (id) => api.del(`/expenses/${id}/`);
const commentsPath = (groupId, expenseId) => expenseId ? `/expenses/${expenseId}/comments/` : `/groups/${groupId}/comments/`;
export const getComments = (groupId, expenseId, page, signal, commentId) => api.get(`${commentsPath(groupId, expenseId)}?page=${page}${commentId ? '&comment_id='+encodeURIComponent(commentId) : ''}`, { signal });
export const postComment = (groupId, expenseId, text, extra = {}) => api.post(commentsPath(groupId, expenseId), { text, ...extra });

export async function getAllMembers(groupId, signal) {
  const members = [];
  let page = 1;
  let result;
  do {
    result = await getMembers(groupId, page++, signal);
    members.push(...result.results);
  } while (result.next);
  return members;
}
