import { api } from './client.js';
export const getProfile = (signal) => api.get('/users/me/', { signal });
export const getDeletionEligibility = (signal) => api.get('/users/me/deletion/', { signal });
export const deleteAccount = (password) => api.post('/users/me/delete/', { password, confirmation: 'DELETE MY ACCOUNT' });
export const updateProfile = (body, signal) => api.patch('/users/me/', body, { signal });
export const uploadProfilePhoto = (photo, signal) => {
  const body = new FormData(); body.append('photo', photo);
  return api.post('/users/me/photo/', body, { signal });
};
