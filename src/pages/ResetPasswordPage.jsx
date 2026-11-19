import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthCard from '../components/AuthCard.jsx';
import Button from '../components/Button.jsx';
import Input from '../components/Input.jsx';
import FormAlert from '../components/FormAlert.jsx';
import * as authApi from '../api/auth.js';
import { validatePasswordPair } from '../utils/validation.js';
import { describeActionError } from '../utils/apiErrors.js';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const uid = params.get('uid');
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [alert, setAlert] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!uid || !token) {
    return (
      <AuthCard>
        <h1>This link can’t be used</h1>
        <p>The reset link is incomplete.</p>
        <Link to="/forgot-password">Request a new reset link</Link>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard>
        <h1>Password updated</h1>
        <p role="status">Sign in with your new password.</p>
        <Link className="btn btn-primary" to="/login">Sign in</Link>
      </AuthCard>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setAlert(null);
    const pair = validatePasswordPair(password, confirm);
    const found = {};
    if (pair.password) found.new_password = pair.password;
    if (pair.confirm) found.confirm_password = pair.confirm;
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await authApi.confirmPasswordReset({ uid, token, newPassword: password, confirmPassword: confirm });
      setPassword('');
      setConfirm('');
      setDone(true);
    } catch (err) {
      const d = describeActionError(err, 'update your password', ['new_password', 'confirm_password']);
      setErrors(d.fieldErrors);
      setAlert({ message: d.message, items: d.other, hint: d.hint, unavailable: d.unavailable });
    } finally {
      setSubmitting(false);
    }
  }

  // Suggest a new link only when the SERVER rejected this one, never during an outage.
  const linkProblem = alert && !alert.unavailable && Object.keys(errors).length === 0;

  return (
    <AuthCard>
      <h1>Choose a new password</h1>
      <form onSubmit={handleSubmit} className="stack" noValidate>
        <FormAlert message={alert?.message} items={alert?.items} hint={alert?.hint} />
        {linkProblem && (
          <p>This link may have expired. <Link to="/forgot-password">Request a new one</Link>.</p>
        )}
        <Input label="New password" type="password" hint="At least 10 characters."
          autoComplete="new-password" value={password}
          onChange={(e) => setPassword(e.target.value)} error={errors.new_password} />
        <Input label="Confirm new password" type="password" autoComplete="new-password"
          value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm_password} />
        <div><Button type="submit" loading={submitting}>{submitting ? 'Updating your password…' : 'Update password'}</Button></div>
      </form>
    </AuthCard>
  );
}
