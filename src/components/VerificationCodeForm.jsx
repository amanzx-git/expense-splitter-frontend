import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Input from './Input.jsx';
import Button from './Button.jsx';
import FormAlert from './FormAlert.jsx';
import { verifyEmailCode, resendVerification } from '../api/auth.js';
import { describeError } from '../utils/apiErrors.js';
import { clearVerification, readVerification, saveVerification } from '../utils/verificationContext.js';
import { useAuth } from '../hooks/useAuth.js';

export default function VerificationCodeForm({ initialEmail = '', initialCooldown = 0, onDelivery, deliveryPending = false }) {
  const [email, setEmail] = useState(initialEmail), [code, setCode] = useState('');
  const [busy, setBusy] = useState(''), [verified, setVerified] = useState(false);
  const [message, setMessage] = useState(''), [error, setError] = useState(''), [cooldown, setCooldown] = useState(initialCooldown);
  const sending = useRef(false), inputs = useRef([]);
  const digits = Array.from({ length: 6 }, (_, index) => code[index]?.trim() || '');
  const { finishVerification } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown((value) => value - 1), 1000); return () => clearTimeout(timer); }, [cooldown]);
  useEffect(() => { if (!busy && !verified && initialEmail) inputs.current[0]?.focus(); }, [busy, verified, initialEmail]);
  useEffect(() => { setCooldown(initialCooldown); }, [initialCooldown]);
  async function complete() {
    await finishVerification(email);
    clearVerification();
    navigate('/dashboard', { replace: true });
  }
  async function verify(value = code) {
    if (sending.current) return;
    if (!email.trim() || !/^[0-9]{6}$/.test(value)) { setError('Enter your email and six-digit verification code.'); return; }
    sending.current = true; setBusy('verify'); setError(''); setMessage('');
    let accepted = false;
    try {
      await verifyEmailCode(email.trim(), value);
      accepted = true; setVerified(true); setCode('');
      await complete();
    } catch (err) {
      if (accepted) setError('Email verified, but we could not confirm your sign-in. Retry or sign in safely.');
      else {
        const detail = describeError(err);
        // A lost response may follow a successful verification and session creation.
        if (detail.unavailable) {
          try { await complete(); return; } catch { /* Preserve the entered email and code for retry. */ }
        }
        setError(err.code === 'VERIFICATION_CODE_EXPIRED' ? 'Code expired. Get a new one.' : err.code === 'INVALID_VERIFICATION_TOKEN' ? 'Incorrect code. Try again.' : detail.message);
        if (['VERIFICATION_CODE_EXPIRED', 'INVALID_VERIFICATION_TOKEN'].includes(err.code)) setCode('');
      }
    } finally { sending.current = false; setBusy(''); }
  }
  async function recover() {
    if (sending.current) return;
    sending.current = true; setBusy('verify'); setError('');
    try { await complete(); }
    catch { setError('Your email is verified. Please sign in if retry does not restore your session.'); }
    finally { sending.current = false; setBusy(''); }
  }
  async function resend() {
    if (sending.current || cooldown || deliveryPending) return;
    if (!email.trim()) { setError('Enter your email.'); return; }
    sending.current = true; setBusy('resend'); setError(''); setMessage('');
    try {
      const previous = readVerification();
      const result = await resendVerification(email.trim(), previous.ticket);
      setCode('');
      setMessage(result.verification_sent === true ? 'A new code has been sent.' : result.message);
      const seconds = result.resend_after ?? 60;
      setCooldown(seconds);
      const context = { ...previous, email: email.trim(), deliveryState: result.verification_status, sent: result.verification_sent === true || previous.sent === true,
        deliveryError: result.verification_sent === true || ['pending', 'sending'].includes(result.verification_status) ? '' : previous.deliveryError, resendAt: Date.now() + seconds * 1000 };
      saveVerification(context);
      onDelivery?.(context);
    }
    catch (err) { setError(err.code === 'EMAIL_DELIVERY_FAILED' ? 'The verification email could not be sent. Please retry.' : describeError(err).message); if (err.status === 429) setCooldown(60); }
    finally { sending.current = false; setBusy(''); }
  }
  return <form onSubmit={(event) => { event.preventDefault(); if (verified) recover(); else verify(); }} className="stack" noValidate>
    {initialEmail ? <p>Verification email: <strong>{email}</strong></p> : <Input label="Verification email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={!!busy} autoFocus />}
    <FormAlert message={error} />{message && <p role="status">{message}</p>}
    {verified ? <div className="row"><Button type="submit" loading={!!busy}>Retry sign-in</Button><Link to="/login">Sign in</Link></div> : <>
      <fieldset className="otp-fieldset" disabled={!!busy}>
        <legend>Verification code</legend>
        <div className="otp-boxes" onPaste={(event) => {
          event.preventDefault();
          const value = event.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
          if (!value) return;
          setCode(value); inputs.current[Math.min(value.length, 5)]?.focus();
          if (/^[0-9]{6}$/.test(value) && email.trim()) verify(value);
        }}>
          {digits.map((digit, index) => <input key={index} ref={(element) => { inputs.current[index] = element; }}
            aria-label={index === 0 ? 'Verification code' : `Code digit ${index + 1}`} className="otp-box"
            inputMode="numeric" autoComplete={index === 0 ? 'one-time-code' : 'off'} pattern="[0-9]*" maxLength={6}
            value={digit} onChange={(event) => {
              const entered = event.target.value.replace(/[^0-9]/g, '');
              const value = entered.length === 6 ? entered : digits.map((digit, position) => position === index ? (entered.slice(-1) || ' ') : (digit || ' ')).join('');
              setCode(value);
              if (entered) inputs.current[Math.min(index + 1, 5)]?.focus();
              if (/^[0-9]{6}$/.test(value) && email.trim()) verify(value);
            }} onKeyDown={(event) => {
              if (event.key === 'Backspace') {
                event.preventDefault();
                const target = digit ? index : Math.max(0, index - 1);
                setCode(digits.map((digit, position) => position === target ? ' ' : (digit || ' ')).join('')); inputs.current[target]?.focus();
              } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault(); inputs.current[Math.max(0, Math.min(5, index + (event.key === 'ArrowLeft' ? -1 : 1)))]?.focus();
              }
            }} />)}
        </div>
      </fieldset>
      {busy === 'verify' && <p role="status"><span className="spinner" aria-hidden="true" /> Verifying your email...</p>}
      <div className="row"><Button type="submit" disabled={!!busy}>{busy === 'verify' ? 'Verifying...' : error && code.length === 6 ? 'Try again' : 'Verify email'}</Button><Button variant="secondary" disabled={!!busy || !!cooldown || deliveryPending} onClick={resend}>{deliveryPending ? 'Email delivery pending...' : cooldown ? `Resend code in ${cooldown}s` : busy === 'resend' ? 'Sending code...' : 'Resend code'}</Button></div>
      {error && <p className="muted">Already verified? <Link to="/login">Sign in</Link></p>}
    </>}
  </form>;
}
