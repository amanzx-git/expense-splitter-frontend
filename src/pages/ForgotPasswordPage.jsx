import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthCard from '../components/AuthCard.jsx';
import Button from '../components/Button.jsx';
import Input from '../components/Input.jsx';
import FormAlert from '../components/FormAlert.jsx';
import * as authApi from '../api/auth.js';
import { describeActionError } from '../utils/apiErrors.js';

// Always shows the same neutral message on success, so nobody can discover which
// emails have accounts.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [alert, setAlert] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setAlert(null);
    if (!email.trim()) { setError('Enter your email.'); return; }
    setError('');
    setSubmitting(true);
    try {
      await authApi.requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      const d = describeActionError(err, 'request a reset link');
      setAlert({ message: d.message, hint: d.hint });
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthCard>
        <h1>Check your email</h1>
        <p role="status">
          If your account can be reset, you will receive an email.
        </p>
        <Link to="/login">Back to sign in</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <h1>Forgot password</h1>
      <form onSubmit={handleSubmit} className="stack" noValidate>
        <FormAlert message={alert?.message} hint={alert?.hint} />
        <Input label="Email" type="email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} error={error} />
        <div><Button type="submit" loading={submitting}>{submitting ? 'Requesting a reset link…' : 'Send reset link'}</Button></div>
      </form>
      <p><Link to="/login">Back to sign in</Link></p>
    </AuthCard>
  );
}
