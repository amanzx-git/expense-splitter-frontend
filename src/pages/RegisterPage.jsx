import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthCard from '../components/AuthCard.jsx';
import Button from '../components/Button.jsx';
import Input from '../components/Input.jsx';
import FormAlert from '../components/FormAlert.jsx';
import * as authApi from '../api/auth.js';
import { saveVerification } from '../utils/verificationContext.js';
import { validateRegistration } from '../utils/validation.js';
import { describeActionError } from '../utils/apiErrors.js';

const FIELDS = ['username', 'full_name', 'email', 'password', 'confirm_password', 'upi_id'];
const EMPTY = { username: '', fullName: '', email: '', password: '', confirmPassword: '', upiId: '' };

export default function RegisterPage() {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [alert, setAlert] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const navigate = useNavigate();
  const [canRecover, setCanRecover] = useState(false);


  const bind = (name) => ({
    value: values[name],
    onChange: (e) => setValues((v) => ({ ...v, [name]: e.target.value })),
  });

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitLock.current) return;
    setAlert(null); setCanRecover(false);
    const { errors: found, value } = validateRegistration(values);
    setErrors(found);
    if (!value) return;

    submitLock.current = true;
    setSubmitting(true);
    try {
      const result = await authApi.register(value);
      saveVerification({ email: value.email, ticket: result.verification_ticket, deliveryState: result.verification_status, deliveryError: result.verification_sent === true || ['pending', 'sending'].includes(result.verification_status) ? '' : 'Your account was created, but email delivery was not confirmed. Resend the code below.', sent: result.verification_sent === true, resendAt: Date.now() + (result.resend_after || 0) * 1000 });
      setValues(EMPTY);
      navigate('/verify-email', { replace: true });
    } catch (err) {
      // On ANY failure (including an outage) the entries stay in the form.
      const d = describeActionError(err, 'create your account', FIELDS);
      setCanRecover(d.unavailable || !!d.fieldErrors.email);
      setErrors(d.fieldErrors);
      setAlert({ message: d.message, items: d.other, hint: d.hint });
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <AuthCard>
      <h1>Create account</h1>
      <form onSubmit={handleSubmit} className="stack" noValidate>
        <FormAlert message={alert?.message} items={alert?.items} hint={alert?.hint} />
        <Input label="Username" hint="3–30 lowercase letters, numbers or underscores; start with a letter."
          autoComplete="username" error={errors.username} {...bind('username')} />
        <Input label="Full name" autoComplete="name" error={errors.full_name} {...bind('fullName')} />
        <Input label="Email" type="email" autoComplete="email" error={errors.email} {...bind('email')} />
        <Input label="Password" type="password" hint="At least 10 characters."
          autoComplete="new-password" error={errors.password} {...bind('password')} />
        <Input label="Confirm password" type="password" autoComplete="new-password"
          error={errors.confirm_password} {...bind('confirmPassword')} />
        <Input label="UPI ID (optional)" hint="We cannot verify your UPI ID. Check it carefully."
          error={errors.upi_id} {...bind('upiId')} />
        <p className="muted">Add a photo to your profile later.</p>
        <div><Button type="submit" loading={submitting}>{submitting ? 'Creating your account…' : 'Create account'}</Button></div>
      </form>
      {canRecover && <p>If you already created this account, <Button variant="secondary" onClick={() => { saveVerification({ email: values.email.trim(), sent: false, resendAt: 0 }); setValues(EMPTY); navigate('/verify-email'); }}>Enter verification code</Button></p>}
      <p>Already have an account? <Link to="/login">Sign in</Link></p>
    </AuthCard>
  );
}
