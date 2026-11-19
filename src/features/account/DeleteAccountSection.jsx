import { useEffect, useRef, useState } from 'react';
import { deleteAccount, getDeletionEligibility } from '../../api/profile.js';
import { useAuth } from '../../hooks/useAuth.js';
import { describeActionError, describeError } from '../../utils/apiErrors.js';
import { rememberAccountDeletion } from '../../utils/accountDeletionNotice.js';
import Modal from '../../components/Modal.jsx';
import Button from '../../components/Button.jsx';
import Input from '../../components/Input.jsx';
import FormAlert from '../../components/FormAlert.jsx';
import LoadingState from '../../components/LoadingState.jsx';

const goHome = () => window.location.replace('/');
const blockerCopy = {
  OUTSTANDING_PAYMENT: 'Finish your pending payments before deleting your account.',
  PAYMENT_AWAITING_CONFIRMATION: 'Wait for payment confirmation before deleting your account.',
  PENDING_SETTLEMENT_REFERENCE: 'Finish your group settlement before deleting your account.',
  UNSETTLED_EXPENSE_REFERENCE: 'Settle your remaining group expenses before deleting your account.',
  ADMIN_TRANSFER_REQUIRED: 'Choose a new group admin before deleting your account.',
};

export default function DeleteAccountSection({ onDeleted = goHome }) {
  const { endSession } = useAuth();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const sending = useRef(false);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    getDeletionEligibility(controller.signal).then(
      (data) => { if (!controller.signal.aborted) setState(data); },
      (err) => { if (!controller.signal.aborted) setError(describeError(err)); },
    );
    return () => controller.abort();
  }, [open, revision]);
  function start() {
    setState(null); setError(null); setPassword(''); setConfirmed(false); setOpen(true);
  }
  function checkAgain() {
    setState(null); setError(null); setRevision((value) => value + 1);
  }
  function close() {
    if (sending.current) return;
    setOpen(false); setPassword(''); setConfirmed(false); setError(null);
  }
  async function submit(event) {
    event.preventDefault();
    if (sending.current || !state?.eligible || !confirmed || !password) return;
    sending.current = true; setBusy(true); setError(null);
    try {
      await deleteAccount(password);
      rememberAccountDeletion();
      endSession?.();
      onDeleted();
    } catch (err) {
      setPassword(''); setConfirmed(false);
      setError(describeActionError(err, 'delete your account'));
      if (err.unavailable) setState(null);
      // A new obligation may have appeared after the modal opened.
      if (err.code === 'ACCOUNT_DELETION_BLOCKED') {
        try { setState(await getDeletionEligibility()); } catch { setState(null); }
      }
    } finally { sending.current = false; setBusy(false); }
  }
  return <section className="card stack danger-zone" aria-labelledby="danger-zone-title">
    <h2 id="danger-zone-title">Delete account</h2>
    <p className="muted">Permanently delete your Splitter account.</p>
    <div><Button variant="danger-outline" onClick={start}>Delete account</Button></div>
    <Modal open={open} title="Delete your account?" onClose={close} busy={busy}>
      <div className="stack">
        <p>Your account will be deleted. This is permanent and will sign you out everywhere.</p>
        <p>Your profile will be removed. Past group expenses and payments will stay as <strong>Deleted member</strong>.</p>
        <details><summary>What happens to my information?</summary><p>Your name, email, UPI ID and photo will be removed. Your comments will be removed and mentions will show Deleted member. Information shared by others may remain; removing stored photos may take longer.</p></details>
        <FormAlert message={error?.message} items={error?.other} hint={error?.hint} />
        {!state && !error && <LoadingState />}
        {state && !state.eligible && <div role="alert" className="stack"><h3>Not ready to delete</h3>
          <ul className="stack">{state.blockers.map((item) => <li key={item.code}>{blockerCopy[item.code] || item.message}
            <ul>{item.group_ids.map((id) => <li key={id}><a href={`/groups/${id}${item.code === 'ADMIN_TRANSFER_REQUIRED' ? '/settings' : ''}`}>{item.code === 'ADMIN_TRANSFER_REQUIRED' ? 'Choose a new admin' : 'Review group payments'}</a></li>)}</ul>
          </li>)}</ul>
        </div>}
        {state?.eligible && <form className="stack" onSubmit={submit}>
          <Input label="Confirm your password" type="password" autoComplete="current-password" maxLength={1024} required disabled={busy} value={password} onChange={(e) => setPassword(e.target.value)} />
          <label className="check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)} />I understand that deleting my account is permanent.</label>
          <div className="modal-actions"><Button variant="secondary" disabled={busy} onClick={close}>Cancel</Button><Button variant="danger" type="submit" loading={busy} disabled={!confirmed || !password}>{busy ? 'Deleting your account…' : 'Permanently delete account'}</Button></div>
        </form>}
        {!state?.eligible && <div className="modal-actions"><Button variant="secondary" onClick={close}>Cancel</Button><Button variant="secondary" onClick={checkAgain}>Check again</Button></div>}
      </div>
    </Modal>
  </section>;
}
