import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App.jsx';
import { AuthProvider } from '../context/AuthContext.jsx';
import { ApiError, unavailableError } from '../api/errors.js';
import * as authApi from '../api/auth.js';

vi.mock('../api/auth.js');

const USER = {
  id: 'u1', username: 'aman', full_name: 'Aman Yadav', email: 'aman@example.com',
  email_verified: true, upi_id: null, profile_photo_url: null,
};
const err = (status, code, message, fields) => new ApiError({ status, code, message, fields });
const signedOut = () => authApi.getMe.mockRejectedValue(err(401, 'AUTHENTICATION_REQUIRED', 'Sign in.'));

function renderApp(path, { strict = false } = {}) {
  const tree = (
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

beforeEach(() => { sessionStorage.clear(); vi.resetAllMocks(); });

describe('route guards', () => {
  it('sends a signed-out visitor to sign in, then back to the page they wanted', async () => {
    const user = userEvent.setup();
    signedOut();
    authApi.login.mockResolvedValue({ user: USER });
    renderApp('/dashboard');

    // The redirect runs inside a React transition; give a busy machine room to finish it.
    expect(await screen.findByRole('heading', { name: 'Sign in' }, { timeout: 5000 })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'aman@example.com');
    await user.type(screen.getByLabelText('Password'), 'password-123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Dashboard' }, { timeout: 5000 })).toBeInTheDocument();
    expect(authApi.login).toHaveBeenCalledWith('aman@example.com', 'password-123');
  });

  it('shows a retry panel, not the login page, when the first session check cannot reach the server', async () => {
    const user = userEvent.setup();
    authApi.getMe
      .mockRejectedValueOnce(unavailableError('network'))
      .mockResolvedValueOnce({ user: USER });
    renderApp('/dashboard');

    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(authApi.getMe).toHaveBeenCalledTimes(2); // Retry asked the backend again
  });

  it('signs out and lands on the home page', async () => {
    const user = userEvent.setup();
    authApi.getMe.mockResolvedValue({ user: USER });
    authApi.logout.mockResolvedValue(null);
    renderApp('/dashboard');

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: /Split expenses\.\s*Keep friendships simple\./ })).toBeInTheDocument();
    expect(authApi.logout).toHaveBeenCalledTimes(1);
  });
});

describe('login', () => {
  it('offers to resend verification for an unverified account', async () => {
    const user = userEvent.setup();
    signedOut();
    authApi.login.mockRejectedValue(err(403, 'EMAIL_NOT_VERIFIED', 'Verify your email before signing in.'));
    authApi.resendVerification.mockResolvedValue({ message: 'If that account needs verification, we sent a new link.' });
    renderApp('/login');

    await user.type(await screen.findByLabelText('Email'), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'whatever-123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Verify your email before signing in.', { exact: false })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Resend verification email' }));
    expect(authApi.resendVerification).toHaveBeenCalledWith('new@example.com');
    expect(await screen.findByText(/If your email needs verification, check your inbox/i)).toBeInTheDocument();
  });

  it('blocks empty fields without calling the API', async () => {
    const user = userEvent.setup();
    signedOut();
    renderApp('/login');
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(screen.getByText(/enter your email/i)).toBeInTheDocument();
    expect(authApi.login).not.toHaveBeenCalled();
  });
});

describe('register', () => {
  async function fill(user, overrides = {}) {
    const v = {
      Username: 'priya_k', 'Full name': 'Priya K', Email: 'priya@example.com',
      Password: 'a-long-password', 'Confirm password': 'a-long-password', ...overrides,
    };
    for (const [label, text] of Object.entries(v)) {
      await user.type(screen.getByLabelText(label), text);
    }
  }

  it('has no photo upload (photos are added later in Profile)', async () => {
    signedOut();
    renderApp('/register');
    await screen.findByRole('heading', { name: 'Create account' });
    expect(screen.queryByLabelText(/photo/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Add a photo to your profile later/i)).toBeInTheDocument();
  });

  it('does not call the API when client validation fails', async () => {
    const user = userEvent.setup();
    signedOut();
    renderApp('/register');
    await screen.findByRole('heading', { name: 'Create account' });
    await fill(user, { Password: 'short', 'Confirm password': 'short' });
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText(/at least 10 characters/i, { selector: '.field-error' })).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('shows server field errors inline and keeps unexpected keys visible', async () => {
    const user = userEvent.setup();
    signedOut();
    authApi.register.mockRejectedValue(
      err(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', {
        username: ['A user with that username already exists.'],
        surprise_field: ['Unexpected problem.'],
      })
    );
    renderApp('/register');
    await screen.findByRole('heading', { name: 'Create account' });
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
    expect(screen.getByText('surprise_field: Unexpected problem.')).toBeInTheDocument();
  });

  it('shows the check-your-email screen on success', async () => {
    const user = userEvent.setup();
    signedOut();
    authApi.register.mockResolvedValue({ user: USER, message: 'Verify your email', verification_sent: true, resend_after: 60 });
    renderApp('/register');
    await screen.findByRole('heading', { name: 'Create account' });
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(authApi.register).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'priya_k', email: 'priya@example.com' })
    );
  });
});

describe('verify email', () => {
  it('posts the token exactly once, even under StrictMode', async () => {
    signedOut();
    authApi.verifyEmail.mockResolvedValue({ message: 'Email verified' });
    renderApp('/verify-email?uid=u1&token=t1', { strict: true });
    expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeInTheDocument();
    expect(authApi.verifyEmail).toHaveBeenCalledTimes(1);
    expect(authApi.verifyEmail).toHaveBeenCalledWith('u1', 't1');
  });

  it('shows an actionable error and a resend form for a bad link', async () => {
    signedOut();
    authApi.verifyEmail.mockRejectedValue(
      err(400, 'INVALID_VERIFICATION_TOKEN', 'This verification link is invalid or has expired.')
    );
    renderApp('/verify-email?uid=u1&token=bad');
    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeInTheDocument();
  });

  it('offers a retry during an outage instead of calling the link invalid', async () => {
    const user = userEvent.setup();
    signedOut();
    authApi.verifyEmail
      .mockRejectedValueOnce(unavailableError('network'))
      .mockResolvedValueOnce({ message: 'Email verified' });
    renderApp('/verify-email?uid=u1&token=t1', { strict: true });

    expect(await screen.findByText('We cannot connect right now. Please try again.', { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/can’t be used/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeInTheDocument();
    expect(authApi.verifyEmail).toHaveBeenCalledTimes(2); // one per attempt, never doubled by StrictMode
  });

  it('handles a link with missing parameters without calling the API', async () => {
    signedOut();
    renderApp('/verify-email');
    expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeInTheDocument();
    expect(screen.getByLabelText('Verification code')).toBeInTheDocument();
    expect(authApi.verifyEmail).not.toHaveBeenCalled();
  });
});

describe('password reset', () => {
  it('always shows the same neutral message after requesting a reset', async () => {
    const user = userEvent.setup();
    signedOut();
    authApi.requestPasswordReset.mockResolvedValue({ message: 'whatever the server says' });
    renderApp('/forgot-password');
    await user.type(await screen.findByLabelText('Email'), 'nobody@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(/If your account can be reset/i)).toBeInTheDocument();
  });

  it('validates the new password before calling the API', async () => {
    const user = userEvent.setup();
    signedOut();
    renderApp('/reset-password?uid=u1&token=t1');
    await user.type(await screen.findByLabelText('New password'), '1234567890');
    await user.type(screen.getByLabelText('Confirm new password'), 'different');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(screen.getByText(/do not match/i)).toBeInTheDocument();
    expect(authApi.confirmPasswordReset).not.toHaveBeenCalled();
  });

  it('sends the uid, token and passwords, then confirms', async () => {
    const user = userEvent.setup();
    signedOut();
    authApi.confirmPasswordReset.mockResolvedValue({ message: 'Password updated' });
    renderApp('/reset-password?uid=u1&token=t1');
    await user.type(await screen.findByLabelText('New password'), 'a-new-password');
    await user.type(screen.getByLabelText('Confirm new password'), 'a-new-password');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeInTheDocument();
    expect(authApi.confirmPasswordReset).toHaveBeenCalledWith({
      uid: 'u1', token: 't1', newPassword: 'a-new-password', confirmPassword: 'a-new-password',
    });
  });

  it('does not tell the user their reset link expired when the real problem is an outage', async () => {
    const user = userEvent.setup();
    signedOut();
    authApi.confirmPasswordReset.mockRejectedValue(unavailableError('network'));
    renderApp('/reset-password?uid=u1&token=t1');
    await user.type(await screen.findByLabelText('New password'), 'a-new-password');
    await user.type(screen.getByLabelText('Confirm new password'), 'a-new-password');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText('We cannot connect right now. Please try again.', { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/link may have expired/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toHaveValue('a-new-password'); // entries kept
  });
});
