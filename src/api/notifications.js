import { api } from './client.js';
export const getUnreadCount = (signal) => api.get('/notifications/unread-count/', { signal });
export const listNotifications = (page, signal) => api.get(`/notifications/?page=${page}`, { signal });
export const markNotificationRead = (id, signal) => api.patch(`/notifications/${id}/read/`, {}, { signal });
