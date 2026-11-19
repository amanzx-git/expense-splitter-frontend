import { api } from './client.js';

export const getBalances = (groupId, signal) => api.get(`/groups/${groupId}/balances/`, { signal });
