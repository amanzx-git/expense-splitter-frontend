import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import VerificationCodeForm from '../components/VerificationCodeForm.jsx';
import VerifyEmailPage from '../pages/VerifyEmailPage.jsx';
import RegisterPage from '../pages/RegisterPage.jsx';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import { AuthContext, AuthProvider } from '../context/AuthContext.jsx';
import { ApiError, unavailableError } from '../api/errors.js';
import * as authApi from '../api/auth.js';

vi.mock('../api/auth.js');
let finishVerification;
const user = { id: 'new', username: 'person', full_name: 'Person', email: 'person@example.com', email_verified: true };
const signedOut = () => new ApiError({ status: 401, code: 'AUTHENTICATION_REQUIRED', message: 'Sign in.' });
beforeEach(() => {
  sessionStorage.clear(); vi.resetAllMocks(); finishVerification = vi.fn().mockResolvedValue(user);
  authApi.verifyEmailCode.mockResolvedValue({ message: 'Email verified', user });
  authApi.resendVerification.mockResolvedValue({ message: 'Verification request processed.' });
});
afterEach(cleanup);
function open() {
  return render(<MemoryRouter initialEntries={['/verify-email']}><AuthContext.Provider value={{ finishVerification }}><Routes>
    <Route path="/verify-email" element={<VerificationCodeForm initialEmail={user.email} />} />
    <Route path="/dashboard" element={<h1>Dashboard</h1>} />
  </Routes></AuthContext.Provider></MemoryRouter>);
}
it('focuses the code immediately and auto-submits a pasted code exactly once', async () => {
  open(); const input = screen.getByLabelText('Verification code'); expect(input).toHaveFocus();
  expect(screen.getByText(user.email)).toBeInTheDocument();
  await userEvent.paste('012345');
  expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  expect(authApi.verifyEmailCode).toHaveBeenCalledExactlyOnceWith(user.email, '012345');
  expect(finishVerification).toHaveBeenCalledExactlyOnceWith(user.email);
  expect(localStorage.length).toBe(0);
});
it('supports keyboard editing and locks duplicate submissions while checking', async () => {
  let resolve;
  authApi.verifyEmailCode.mockImplementation(() => new Promise((done) => { resolve = done; }));
  open(); const input = screen.getByLabelText('Verification code');
  await userEvent.type(input, '12345'); await userEvent.keyboard('{ArrowLeft}{Backspace}');
  expect(screen.getAllByRole('textbox').map((box) => box.value).join('')).toBe('1234');
  await userEvent.click(input); await userEvent.paste('654321');
  expect(await screen.findByRole('button', { name: 'Verifying...' })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('Verifying your email');
  await userEvent.keyboard('{Enter}'); expect(authApi.verifyEmailCode).toHaveBeenCalledTimes(1);
  resolve({ user }); await screen.findByRole('heading', { name: 'Dashboard' });
});
it.each([['INVALID_VERIFICATION_TOKEN', 'Incorrect code. Try again.'], ['VERIFICATION_CODE_EXPIRED', 'Code expired. Get a new one.']])('keeps registration context after %s', async (code, message) => {
  authApi.verifyEmailCode.mockRejectedValue(new ApiError({ status: 400, code, message: 'Server message' }));
  open(); await userEvent.type(screen.getByLabelText('Verification code'), '123456');
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(screen.getByText(user.email)).toBeInTheDocument();
  expect(screen.getByLabelText('Verification code')).toHaveValue('');
  await waitFor(() => expect(screen.getByLabelText('Verification code')).toHaveFocus());
  expect(finishVerification).not.toHaveBeenCalled();
});
it('resends for the same email and enforces cooldown', async () => {
  open(); await userEvent.click(screen.getByRole('button', { name: 'Resend code' }));
  expect(await screen.findByRole('button', { name: 'Resend code in 60s' })).toBeDisabled();
  expect(authApi.resendVerification).toHaveBeenCalledExactlyOnceWith(user.email, undefined);
});
it('keeps email and code after an outage and offers an explicit retry', async () => {
  authApi.verifyEmailCode.mockRejectedValueOnce(unavailableError('network'));
  finishVerification.mockRejectedValueOnce(signedOut());
  open(); await userEvent.type(screen.getByLabelText('Verification code'), '123456');
  expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  expect(screen.getAllByRole('textbox').map((box) => box.value).join('')).toBe('123456');
  expect(screen.getByText(user.email)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('heading', { name: 'Dashboard' });
});
it('does not reconsume a verified code when profile/session recovery fails', async () => {
  finishVerification.mockRejectedValueOnce(signedOut());
  open(); await userEvent.type(screen.getByLabelText('Verification code'), '123456');
  expect(await screen.findByRole('button', { name: 'Retry sign-in' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Retry sign-in' }));
  await screen.findByRole('heading', { name: 'Dashboard' });
  expect(authApi.verifyEmailCode).toHaveBeenCalledTimes(1);
});
function registration(path = '/register') {
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><Routes>
    <Route path="/register" element={<RegisterPage />} /><Route path="/verify-email" element={<VerifyEmailPage />} />
    <Route element={<ProtectedRoute />}><Route path="/dashboard" element={<h1>Dashboard</h1>} /></Route>
  </Routes></AuthProvider></MemoryRouter>);
}
async function createAccount() {
  for (const [label, value] of Object.entries({ Username: 'person', 'Full name': 'Person', Email: user.email, Password: 'Strong-password-12345', 'Confirm password': 'Strong-password-12345' })) await userEvent.type(screen.getByLabelText(label), value);
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
}
it('switches registration straight to OTP, signs in after verification, and restores the session on refresh', async () => {
  authApi.getMe.mockRejectedValue(signedOut()); authApi.register.mockResolvedValue({ user: { ...user, email_verified: false }, message: 'Verify your email', verification_sent: true, resend_after: 60 });
  const view = registration(); await createAccount();
  expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
  expect(screen.getByLabelText('Verification code')).toHaveFocus();
  expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Go to sign in' })).not.toBeInTheDocument();
  authApi.getMe.mockResolvedValue({ user });
  await userEvent.type(screen.getByLabelText('Verification code'), '123456');
  await screen.findByRole('heading', { name: 'Dashboard' });
  expect(authApi.register).toHaveBeenCalledTimes(1); expect(authApi.login).not.toHaveBeenCalled();
  view.unmount(); registration('/dashboard');
  await screen.findByRole('heading', { name: 'Dashboard' });
  expect(authApi.getMe).toHaveBeenCalledTimes(3);
});
it('preserves the created account when delivery fails and allows resend immediately', async () => {
  authApi.getMe.mockRejectedValue(signedOut()); authApi.register.mockResolvedValue({ user, message: 'Your account was created, but the verification email could not be sent. Please request a new verification email.' });
  registration(); await createAccount();
  expect(await screen.findByText(/Delivery has not been confirmed/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Resend code' }));
  await screen.findByRole('button', { name: 'Resend code in 60s' });
  expect(authApi.register).toHaveBeenCalledTimes(1);
});

it('verifies a legacy email link and signs in directly to the dashboard', async () => {
  authApi.getMe.mockRejectedValue(signedOut());
  authApi.verifyEmail.mockImplementation(async () => { authApi.getMe.mockResolvedValue({ user }); return { message: 'Email verified', user }; });
  render(<MemoryRouter initialEntries={['/verify-email?uid=new&token=single-use']}><AuthProvider><Routes>
    <Route path="/verify-email" element={<VerifyEmailPage />} />
    <Route element={<ProtectedRoute />}><Route path="/dashboard" element={<h1>Dashboard</h1>} /></Route>
  </Routes></AuthProvider></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Dashboard' });
  expect(authApi.verifyEmail).toHaveBeenCalledExactlyOnceWith('new', 'single-use');
  expect(authApi.login).not.toHaveBeenCalled();
});
it('does not claim sign-in when the session profile belongs to another account', async () => {
  authApi.getMe.mockRejectedValue(signedOut()); authApi.register.mockResolvedValue({ user, message: 'Verify your email', verification_sent: true, resend_after: 60 });
  registration(); await createAccount();
  await screen.findByLabelText('Verification code');
  authApi.getMe.mockResolvedValue({ user: { ...user, email: 'other@example.com' } });
  await userEvent.type(screen.getByLabelText('Verification code'), '123456');
  expect(await screen.findByRole('button', { name: 'Retry sign-in' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();
});
it('recovers ambiguous registration without creating another account', async () => {
  authApi.getMe.mockRejectedValue(signedOut()); authApi.register.mockRejectedValue(unavailableError('network'));
  registration(); await createAccount();
  await userEvent.click(await screen.findByRole('button', { name: 'Enter verification code' }));
  expect(await screen.findByLabelText('Verification code')).toHaveFocus();
  expect(screen.getByText(user.email)).toBeInTheDocument();
  expect(authApi.register).toHaveBeenCalledTimes(1);
});

it('does not claim email delivery without explicit backend confirmation', async () => {
  authApi.getMe.mockRejectedValue(signedOut());
  authApi.register.mockResolvedValue({ user, message: 'Verify your email' });
  registration(); await createAccount();
  expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeInTheDocument();
  expect(screen.queryByText(/We've sent/)).not.toBeInTheDocument();
  expect(screen.getAllByRole('textbox')).toHaveLength(6);
});
it('restores the verification email and cooldown after refresh', async () => {
  authApi.getMe.mockRejectedValue(signedOut());
  sessionStorage.setItem('splitter:verification', JSON.stringify({ email: user.email, sent: true, resendAt: Date.now() + 60000 }));
  registration('/verify-email');
  expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
  expect(screen.getByText(`We've sent a 6-digit code to ${user.email}.`)).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: /Resend code in/ })).toBeDisabled();
});

it('shows pending delivery until the provider acceptance status is confirmed', async () => {
  authApi.getMe.mockRejectedValue(signedOut());
  authApi.register.mockResolvedValue({ user, verification_status: 'pending', verification_sent: false, verification_ticket: 'opaque-ticket' });
  authApi.verificationStatus.mockResolvedValue({ verification_status: 'sent', verification_sent: true, resend_after: 60 });
  registration(); await createAccount();
  expect(await screen.findByRole('heading', { name: 'Preparing your verification email' })).toBeInTheDocument();
  expect(screen.queryByText(/We've sent/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Email delivery pending...' })).toBeDisabled();
  expect(await screen.findByRole('heading', { name: 'Check your email' }, { timeout: 3000 })).toBeInTheDocument();
  expect(authApi.register).toHaveBeenCalledTimes(1);
  expect(authApi.verificationStatus).toHaveBeenCalledTimes(1);
  expect(await screen.findByRole('button', { name: /Resend code in/ })).toBeDisabled();
});
it('offers retry on delivery failure and polls a queued resend without duplicate accounts', async () => {
  authApi.getMe.mockRejectedValue(signedOut());
  authApi.register.mockResolvedValue({ user, verification_status: 'pending', verification_sent: false, verification_ticket: 'opaque-ticket' });
  authApi.verificationStatus.mockResolvedValueOnce({ verification_status: 'failed', verification_sent: false, resend_after: 0 }).mockResolvedValue({ verification_status: 'sent', verification_sent: true, resend_after: 60 });
  authApi.resendVerification.mockResolvedValue({ verification_status: 'pending', verification_sent: false, resend_after: 0, message: 'Verification delivery requested.' });
  registration(); await createAccount();
  expect(await screen.findByRole('alert')).toHaveTextContent('Email could not be delivered');
  await userEvent.click(screen.getByRole('button', { name: 'Resend code' }));
  expect(await screen.findByRole('heading', { name: 'Check your email' }, { timeout: 3000 })).toBeInTheDocument();
  expect(authApi.register).toHaveBeenCalledTimes(1);
  expect(authApi.resendVerification).toHaveBeenCalledExactlyOnceWith(user.email, 'opaque-ticket');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('preserves email and entered digits when delivery status polling loses the network', async () => {
  authApi.getMe.mockRejectedValue(signedOut());
  authApi.register.mockResolvedValue({ user, verification_status: 'pending', verification_sent: false, verification_ticket: 'opaque-ticket' });
  authApi.verificationStatus.mockRejectedValueOnce(unavailableError('network')).mockResolvedValue({ verification_status: 'sent', verification_sent: true, resend_after: 60 });
  registration(); await createAccount();
  await screen.findByRole('heading', { name: 'Preparing your verification email' });
  await userEvent.type(screen.getByLabelText('Verification code'), '123');
  expect(await screen.findByText(/We could not check email delivery/)).toBeInTheDocument();
  expect(screen.getAllByRole('textbox').map(box => box.value).join('')).toBe('123');
  expect(screen.getByText(user.email)).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: 'Check your email' }, { timeout: 5000 })).toBeInTheDocument();
  expect(screen.getAllByRole('textbox').map(box => box.value).join('')).toBe('123');
});
