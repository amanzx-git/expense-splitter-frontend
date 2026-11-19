// MOCK API: used only when VITE_USE_MOCKS=true. Not the real backend.
// To simulate an outage, run  __splitterMockOutage = true  in the browser console
// (and  __splitterMockOutage = false  to recover).
import { ApiError, unavailableError } from './errors.js';

const USERNAME_RE = /^[a-z][a-z0-9_]{2,29}$/;
const UPI_RE = /^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,35}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const users = [
  {
    id: '11111111-1111-4111-8111-111111111111', username: 'aman', full_name: 'Aman Yadav',
    email: 'aman@example.com', email_verified: true, upi_id: null, profile_photo_url: null,
    password: 'password-123',
  },
];
const verifyTokens = new Map(); // token -> user id
const resetTokens = new Map();
let sessionUserId = null;
let counter = 0;

const fail = (status, code, message, fields) => {
  throw new ApiError({ status, code, message, fields });
};
const publicUser = ({ id, username, full_name, email, email_verified, upi_id, profile_photo_url }) => ({
  id, username, full_name, email, email_verified, upi_id, profile_photo_url,
});
function issueToken(map, userId, kind, path) {
  const token = `mock-token-${++counter}`;
  map.set(token, userId);
  console.info(`[MOCK EMAIL] ${kind}: http://localhost:5173${path}?uid=${userId}&token=${token}`);
}
function dropTokens(map, userId) {
  for (const [t, id] of map) if (id === userId) map.delete(t);
}
const findByEmail = (email) => users.find((u) => u.email === String(email ?? '').trim().toLowerCase());

const routes = {
  'GET /auth/csrf/': () => {
    document.cookie = 'csrftoken=mock-csrf-token; path=/'; // fake, non-sensitive
    return { message: 'CSRF cookie set' };
  },

  'POST /auth/register/': (b) => {
    const f = {};
    const add = (k, m) => { f[k] = [m]; };
    if ('photo' in b) add('photo', 'Photos cannot be uploaded during registration.');
    if (!USERNAME_RE.test(b.username ?? '')) add('username', 'Enter a valid username.');
    else if (users.some((u) => u.username === b.username)) add('username', 'A user with that username already exists.');
    if (!(b.full_name ?? '').trim()) add('full_name', 'This field may not be blank.');
    const email = String(b.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) add('email', 'Enter a valid email address.');
    else if (users.some((u) => u.email === email)) add('email', 'A user with that email already exists.');
    if ((b.password ?? '').length < 10) add('password', 'This password is too short. It must contain at least 10 characters.');
    if (b.password !== b.confirm_password) add('confirm_password', 'Passwords do not match.');
    if (b.upi_id && !UPI_RE.test(b.upi_id)) add('upi_id', 'Enter a valid UPI ID.');
    if (Object.keys(f).length > 0) fail(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', f);

    const user = {
      id: crypto.randomUUID(), username: b.username, full_name: b.full_name.trim(), email,
      email_verified: false, upi_id: b.upi_id ?? null, profile_photo_url: null, password: b.password,
    };
    users.push(user);
    issueToken(verifyTokens, user.id, 'Verify your email', '/verify-email');
    return { user: publicUser(user), message: 'Verify your email' };
  },

  'POST /auth/verify-email/': ({ uid, token }) => {
    const user = users.find((u) => u.id === verifyTokens.get(token));
    if (!user || user.id !== uid || user.email_verified) {
      fail(400, 'INVALID_VERIFICATION_TOKEN', 'This verification link is invalid or has expired.');
    }
    user.email_verified = true;
    dropTokens(verifyTokens, user.id); // single use
    return { message: 'Email verified' };
  },

  'POST /auth/resend-verification/': ({ email }) => {
    const user = findByEmail(email);
    if (user && !user.email_verified) issueToken(verifyTokens, user.id, 'Verify your email', '/verify-email');
    return { message: 'If that account needs verification, we have sent a new link.' }; // always generic
  },

  'POST /auth/login/': ({ email, password }) => {
    const user = findByEmail(email);
    if (!user || user.password !== password) {
      fail(400, 'VALIDATION_ERROR', 'Incorrect email or password.'); // see CR-F3-1
    }
    if (!user.email_verified) {
      fail(403, 'EMAIL_NOT_VERIFIED', 'Verify your email before signing in.'); // no session created
    }
    sessionUserId = user.id;
    return { user: publicUser(user) };
  },

  'POST /auth/logout/': () => {
    sessionUserId = null;
    return null;
  },

  'POST /auth/password-reset/': ({ email }) => {
    const user = findByEmail(email);
    if (user) issueToken(resetTokens, user.id, 'Reset your password', '/reset-password');
    return { message: 'If an account exists for that email, we have sent reset instructions.' };
  },

  'POST /auth/password-reset/confirm/': (b) => {
    const user = users.find((u) => u.id === resetTokens.get(b.token));
    if (!user || user.id !== b.uid) {
      fail(400, 'VALIDATION_ERROR', 'This reset link is invalid or has expired.'); // see CR-F3-2
    }
    const f = {};
    if ((b.new_password ?? '').length < 10) f.new_password = ['This password is too short. It must contain at least 10 characters.'];
    if (b.new_password !== b.confirm_password) f.confirm_password = ['Passwords do not match.'];
    if (Object.keys(f).length > 0) fail(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', f);
    user.password = b.new_password;
    dropTokens(resetTokens, user.id);
    return { message: 'Password updated' };
  },

  'GET /users/me/': () => {
    const user = users.find((u) => u.id === sessionUserId);
    if (!user) fail(401, 'AUTHENTICATION_REQUIRED', 'Sign in to continue.');
    return { user: publicUser(user) };
  },
};

export async function mockRequest(method, path, body) {
  await new Promise((resolve) => setTimeout(resolve, 250)); // feel like a network
  if (globalThis.__splitterMockOutage) throw unavailableError('network'); // simulated outage
  const handler = routes[`${method} ${path}`];
  if (!handler) fail(404, 'NOT_FOUND', 'This endpoint is not mocked yet.');
  return handler(body ?? {});
}
