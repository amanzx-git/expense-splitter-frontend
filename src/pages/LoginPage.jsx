import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AuthCard from '../components/AuthCard.jsx';
import Button from '../components/Button.jsx';
import Input from '../components/Input.jsx';
import FormAlert from '../components/FormAlert.jsx';
import { useAuth } from '../hooks/useAuth.js';
import * as authApi from '../api/auth.js';
import { describeActionError } from '../utils/apiErrors.js';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [alert, setAlert] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [resending, setResending] = useState(false);
  const [resentMessage, setResentMessage] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  useEffect(() => { if (!resendCooldown) return; const timer = setTimeout(() => setResendCooldown((value) => value - 1), 1000); return () => clearTimeout(timer); }, [resendCooldown]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setAlert(null);
    setUnverified(false);
    setResentMessage('');
    const found = {};
    if (!email.trim()) found.email = 'Enter your email.';
    if (!password) found.password = 'Enter your password.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await login(email.trim(), password); // GuestRoute redirects once the user is set
    } catch (err) {
      // An outage is reported as an outage; the typed email and password stay put.
      const d = describeActionError(err, 'sign in', ['email', 'password']);
      setErrors(d.fieldErrors);
      setAlert({ message: d.message, items: d.other, hint: d.hint });
      if (d.code === 'EMAIL_NOT_VERIFIED') setUnverified(true);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (resending || resendCooldown) return;
    setResending(true);
    try {
      await authApi.resendVerification(email.trim());
      setResendCooldown(60);
      setResentMessage('If your email needs verification, check your inbox.');
    } catch (err) {
      const d = describeActionError(err, 'request a verification email');
      setAlert({ message: d.message, items: [], hint: d.hint });
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthCard>
      <h1>Sign in</h1>
      <form onSubmit={handleSubmit} className="stack" noValidate>
        <FormAlert message={alert?.message} items={alert?.items} hint={alert?.hint} />
        {unverified && (
          <div className="stack">
            <Button variant="secondary" onClick={handleResend} loading={resending} disabled={!!resendCooldown}>
              {resending ? 'Requesting an email…' : resendCooldown ? `Resend available in ${resendCooldown}s` : 'Resend verification email'}
            </Button>
            {resentMessage && <p role="status" className="notice">{resentMessage}</p>}<Link to="/verify-email">Enter verification code</Link>
          </div>
        )}
        <Input label="Email" type="email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <Input label="Password" type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        <div><Button type="submit" loading={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</Button></div>
      </form>
      <p><Link to="/forgot-password">Forgot your password?</Link></p>
      <p>New here? <Link to="/register">Create an account</Link></p>
    </AuthCard>
  );
}
