import { api } from './client.js';

export const register = (data) => api.post('/auth/register/', data, { timeoutMs: 45000 });
export const verifyEmail = (uid, token) => api.post('/auth/verify-email/', { uid, token });
export const verifyEmailCode = (email, code) => api.post('/auth/verify-email/', { email, code });
export const resendVerification = (email, ticket) => api.post('/auth/resend-verification/', { email, ...(ticket ? { ticket } : {}) }, { timeoutMs: 45000 });
export const login = (email, password) => api.post('/auth/login/', { email, password });
export const logout = () => api.post('/auth/logout/', {});
export const requestPasswordReset = (email) => api.post('/auth/password-reset/', { email });
export const confirmPasswordReset = ({ uid, token, newPassword, confirmPassword }) =>
  api.post('/auth/password-reset/confirm/', {
    uid, token, new_password: newPassword, confirm_password: confirmPassword,
  });
export const getMe = (signal) => api.get('/users/me/', { signal });

export const verificationStatus = (email, ticket, signal) => api.post('/auth/verification-status/', { email, ticket }, { signal });
