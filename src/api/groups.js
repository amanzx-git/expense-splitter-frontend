import { api } from './client.js';

export const getGroups = (page, signal) => api.get(`/groups/?page=${page}`, { signal });
export const createGroup = (body) => api.post('/groups/', body);
export const getGroup = (id, signal) => api.get(`/groups/${id}/`, { signal });
export const updateGroup = (id, body) => api.patch(`/groups/${id}/`, body);
export const transferAdmin = (id, userId) => api.post(`/groups/${id}/transfer-admin/`, { new_admin_user_id: userId });
export const uploadGroupPhoto = (id, photo, signal) => {
  const body = new FormData(); body.append('photo', photo);
  return api.post(`/groups/${id}/photo/`, body, { signal });
};
export const getMembers = (id, page, signal) => api.get(`/groups/${id}/members/?page=${page}`, { signal });
export const removeMember = (id, userId) => api.post(`/groups/${id}/members/${userId}/remove/`, {});
export const searchUsers = (username, signal) => api.get(`/users/search/?username=${encodeURIComponent(username)}`, { signal });
export const inviteUser = (id, username) => api.post(`/groups/${id}/invitations/`, { username });
export const getInvitations = (groupId, status, page, signal) => api.get(
  `${groupId ? `/groups/${groupId}` : ''}/invitations/?page=${page}${status ? `&status=${status}` : ''}`, { signal },
);
export const actOnInvitation = (id, action) => api.post(`/invitations/${id}/${action}/`, {});
