import { api } from './client.js';

export const listSettlements = (groupId, page, signal) => api.get(`/groups/${groupId}/settlements/?page=${page}`, { signal });
export const getSettlement = (id, signal) => api.get(`/settlements/${id}/`, { signal });
export const generateSettlement = (groupId) => api.post(`/groups/${groupId}/settlements/`, {});

export const reportPayment = (id) => api.post(`/transactions/${id}/report-payment/`, {});
export const confirmReceipt = (id) => api.post(`/transactions/${id}/confirm/`, {});
