import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import AuthCard from '../components/AuthCard.jsx';
import Button from '../components/Button.jsx';
import Input from '../components/Input.jsx';
import LoadingState from '../components/LoadingState.jsx';
import FormAlert from '../components/FormAlert.jsx';
import * as authApi from '../api/auth.js';
import { readVerification, saveVerification } from '../utils/verificationContext.js';
import VerificationCodeForm from '../components/VerificationCodeForm.jsx';
import { describeError } from '../utils/apiErrors.js';

function ResendForm() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown((value) => value - 1), 1000); return () => clearTimeout(timer); }, [cooldown]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (sending || cooldown) return;
    if (!email.trim()) { setError('Enter your email.'); return; }
    setError('');
    setSending(true);
    try {
      await authApi.resendVerification(email.trim());
      setCooldown(60);
      setMessage('If your email needs verification, check your inbox.');
    } catch (err) {
      setError(describeError(err).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack" noValidate>
      <h2>Send a new link</h2>
      <Input label="Email" type="email" autoComplete="email" value={email}
        onChange={(e) => setEmail(e.target.value)} error={error} />
      <div><Button type="submit" loading={sending} disabled={!!cooldown}>{sending ? 'Requesting an email…' : cooldown ? `Resend available in ${cooldown}s` : 'Resend verification email'}</Button></div>
      {message && <p role="status" className="notice">{message}</p>}
    </form>
  );
}

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const [context, setContext] = useState(readVerification);
  const [initialCooldown, setInitialCooldown] = useState(() => Math.max(0, Math.ceil(((readVerification().resendAt || 0) - Date.now()) / 1000)));
  const { finishVerification } = useAuth();
  const navigate = useNavigate();
  const verifiedFor = useRef(null);
  const uid = params.get('uid');
  const token = params.get('token');
  // verifying | session-error | error | unavailable | missing
  const [status, setStatus] = useState(uid && token ? 'verifying' : 'missing');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const startedFor = useRef(null);
  const [deliveryNotice, setDeliveryNotice] = useState('');
  const deliveryPending = ['pending', 'sending'].includes(context.deliveryState);
  const deliveryEmail = context.email;
  const deliveryTicket = context.ticket;
  useEffect(() => {
    if (!deliveryPending || !deliveryTicket || uid || token) return;
    const controller = new AbortController();
    let timer;
    let failures = 0;
    async function poll() {
      try {
        const result = await authApi.verificationStatus(deliveryEmail, deliveryTicket, controller.signal);
        if (controller.signal.aborted) return;
        failures = 0; setDeliveryNotice('');
        const next = { email: deliveryEmail, ticket: deliveryTicket, deliveryState: result.verification_status, sent: result.verification_sent === true,
          deliveryError: result.verification_status === 'failed' ? 'Email could not be delivered. Please retry below.' : '',
          resendAt: Date.now() + (result.resend_after || 0) * 1000 };
        saveVerification(next); setContext(next); setInitialCooldown(result.resend_after || 0);
        if (['pending', 'sending'].includes(result.verification_status)) timer = setTimeout(poll, 2500);
      } catch (error) {
        if (controller.signal.aborted) return;
        failures += 1;
        setDeliveryNotice('We could not check email delivery. Your account is saved; we will retry.');
        if (error.status === 403) {
          const next = { email: deliveryEmail, ticket: deliveryTicket, deliveryState: 'unknown', sent: false, resendAt: 0 };
          setDeliveryNotice('Delivery status can no longer be checked. Enter an existing code or resend.');
          saveVerification(next); setContext(next);
          return;
        }
        timer = setTimeout(poll, Math.min(10000, 2500 * failures));
      }
    }
    timer = setTimeout(poll, 500);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [deliveryPending, deliveryEmail, deliveryTicket, uid, token]);

  useEffect(() => {
    if (!uid || !token) { startedFor.current = null; setStatus('missing'); return; }
    // StrictMode runs effects twice in development; a single-use token must be posted once
    // per attempt. We deliberately do not abort in cleanup (that would cancel the only request).
    const key = `${uid}:${token}:${attempt}`;
    if (startedFor.current === key) return;
    startedFor.current = key;
    setStatus('verifying');
    const credential = `${uid}:${token}`;
    const request = verifiedFor.current?.credential === credential ? Promise.resolve(verifiedFor.current) : authApi.verifyEmail(uid, token).then((result) => {
      const verified = { credential, email: result.user?.email };
      verifiedFor.current = verified;
      return verified;
    });
    request.then(async (result) => {
        if (startedFor.current !== key) return;
        await finishVerification(result.email);
        if (startedFor.current === key) navigate('/dashboard', { replace: true });
      })
      .catch((err) => {
        if (startedFor.current !== key) return;
        const d = describeError(err);
        setMessage(d.message);
        setStatus(verifiedFor.current?.credential === `${uid}:${token}` ? 'session-error' : d.unavailable ? 'unavailable' : 'error');
      });
  }, [attempt, uid, token, finishVerification, navigate]);

  if (!uid && !token) return <AuthCard>
    <h1>{deliveryPending ? 'Preparing your verification email' : context.sent ? 'Check your email' : 'Verify your email'}</h1>
    {deliveryPending && <p role="status">Your account is created. Email delivery is pending. You can keep this page open or return later.</p>}
    {deliveryNotice && <p role="status">{deliveryNotice}</p>}
    {!deliveryPending && context.email && (context.sent ? <p>We've sent a 6-digit code to {context.email}.</p> : <p>Delivery has not been confirmed. Enter an existing code or resend below.</p>)}
    <FormAlert message={context.deliveryError} />
    <VerificationCodeForm initialEmail={context.email || ''} initialCooldown={initialCooldown} onDelivery={setContext} deliveryPending={deliveryPending} />
  </AuthCard>;
  if (status === 'verifying') return <LoadingState label="Verifying your email…" />;

  if (status === 'session-error') return <AuthCard><h1>Email verified</h1><FormAlert message="We could not confirm your sign-in. Retry or sign in safely." /><div className="row"><Button onClick={() => setAttempt((value) => value + 1)}>Retry sign-in</Button><Link to="/login">Sign in</Link></div></AuthCard>;

  if (status === 'unavailable') {
    return (
      <AuthCard>
        <h1>We couldn’t verify your email yet</h1>
        <FormAlert message={message} />
        <p>Try signing in; your email may already be verified.</p>
        <div className="row">
          <Button onClick={() => setAttempt((a) => a + 1)}>Try again</Button>
          <Link to="/login">Go to sign in</Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <h1>This link can’t be used</h1>
      <FormAlert message={status === 'missing' ? 'The verification link is incomplete.' : message} />
      <p>Links expire after 24 hours and can only be used once.</p>
      <ResendForm />
    </AuthCard>
  );
}
