import { countLabel } from '../utils/wording.js';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getSettlement, reportPayment, confirmReceipt } from '../api/settlements.js';
import { useGroupResource, ResourceState } from '../features/groups/resources.jsx';
import Button from '../components/Button.jsx';
import Modal from '../components/Modal.jsx';
import FormAlert from '../components/FormAlert.jsx';
import PaymentTransaction from '../features/settlements/PaymentTransaction.jsx';
import { describeActionError } from '../utils/apiErrors.js';
import EmptyState from '../components/EmptyState.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import LoadingState from '../components/LoadingState.jsx';
import { useAuth } from '../hooks/useAuth.js';
import PaymentTable from '../features/settlements/PaymentTable.jsx';
import Money from '../components/Money.jsx';
import { PaymentSummary } from '../features/settlements/paymentPresentation.jsx';
import PaymentAttention from '../features/settlements/PaymentAttention.jsx';
import usePaymentStateRefresh from '../hooks/usePaymentStateRefresh.js';

export default function SettlementPage() {
  const { groupId, settlementId } = useParams();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const resource = useGroupResource((signal) => getSettlement(settlementId, signal), [settlementId, groupId]);
  const settlement = resource.data?.settlement;
  const [selection, setSelection] = useState(null);
  const activeId = params.get('payment');
  const requestScope = useRef(null);
  const opener = useRef(null);
  const valid = settlement?.group_id === groupId && settlement?.id === settlementId;
  const activePayment = valid ? settlement.transactions.find((item) => item.id === activeId) : null;
  const transactions = valid ? settlement.transactions : [];
  const confirmed = transactions.filter((item) => item.status === 'done').length;
  const waiting = transactions.filter((item) => item.status === 'payment_reported').length;
  // Display-only sum of immutable transfer amounts; never use floating-point money.
  const totalPaise = transactions.reduce((total, item) => {
    const [rupees, paise = '00'] = item.amount.split('.');
    return total + BigInt(rupees) * 100n + BigInt(paise.padEnd(2, '0'));
  }, 0n);
  const totalAmount = `${totalPaise / 100n}.${String(totalPaise % 100n).padStart(2, '0')}`;
  function openPayment(id, target) {
    opener.current = target; setError(null); setMessage(''); setSelection(null);
    const next = new URLSearchParams(params); next.set('payment', id); setParams(next);
  }
  function closePayment() { if (!busy) {
    const next = new URLSearchParams(params); next.delete('payment'); setParams(next, { replace: true });
    setSelection(null); setTimeout(() => {
    const target = opener.current?.isConnected ? opener.current : [...document.querySelectorAll('[data-payment-id]')].find((node) => node.dataset.paymentId === activeId);
    target?.focus();
  }, 0); } }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    requestScope.current = `${groupId}/${settlementId}/${activeId}`;
    setSelection(null); setError(null); setMessage('');
    return () => { requestScope.current = null; };
  }, [groupId, settlementId, activeId]);
  useEffect(() => { opener.current = null; }, [groupId, settlementId]);
  usePaymentStateRefresh(resource.refresh, busy || !!selection);
  const selectionCurrent = selection && selection.item.id === activeId && activePayment && valid;
  async function submitPayment() {
    if (!selectionCurrent || busy) return;
    const scope = requestScope.current;
    setBusy(true); setError(null); setMessage('');
    try {
      if (selection.action === 'report') await reportPayment(selection.item.id);
      else await confirmReceipt(selection.item.id);
      if (requestScope.current !== scope) return;
      setMessage(selection.action === 'report' ? 'Payment marked as paid. Waiting for the receiver to confirm.' : 'Receipt confirmed.');
      setSelection(null); resource.refresh();
    } catch (err) {
      if (requestScope.current !== scope) return;
      setError(describeActionError(err, selection.action === 'report' ? 'mark this payment as paid' : 'confirm receipt'));
      setSelection(null);
      if ([403, 404, 409].includes(err.status)) resource.refresh();
    } finally { if (requestScope.current !== null) setBusy(false); }
  }
  return <div className="stack">
    <Link to={`/groups/${groupId}`}>Back to group</Link>
    <h1>Official settlement</h1>
    {!activeId && <FormAlert message={error?.message} items={error?.other} hint={error?.hint} />}
    {!activeId && message && <p role="status">{message}</p>}
    <Modal open={!!activeId} busy={busy} title="Payment details" onClose={closePayment}>
      <FormAlert message={error?.message} items={error?.other} hint={error?.hint} />
      {message && <p role="status">{message}</p>}
      {resource.loading ? <LoadingState /> : resource.error ? <ErrorMessage message={resource.error.message} onRetry={resource.refresh} /> : activePayment ? <PaymentTransaction key={activePayment.id} groupId={groupId} item={activePayment} settlementStatus={settlement.status} busy={busy} onAction={(item, action) => { setError(null); setSelection({ item, action }); }} /> : <ErrorMessage message="Payment not found in this group." />}
    </Modal>
    <Modal open={!!selectionCurrent} busy={busy} title={selection?.action === 'confirm' ? 'Confirm money received?' : "Have you paid?"} onClose={() => { if (!busy) setSelection(null); }}>
      <p>{selection?.action === 'confirm' ? 'Confirm that you received this money outside Splitter.' : 'Confirm that you paid outside Splitter. The receiver must confirm receipt.'}</p>
      <p>Splitter does not send money or check payments.</p>
      <div className="modal-actions">
        <Button variant="secondary" disabled={busy} onClick={() => setSelection(null)}>Cancel</Button>
        <Button loading={busy} onClick={submitPayment}>{busy ? (selection?.action === 'confirm' ? 'Confirming receipt…' : 'Marking payment as paid…') : selection?.action === 'confirm' ? 'Confirm received outside the app' : 'Confirm payment sent'}</Button>
      </div>
    </Modal>
    <ResourceState resource={resource}>
      {settlement && (!valid ? <ErrorMessage message="Settlement not found in this group." /> : <>
        <PaymentAttention settlement={settlement} userId={user?.id} busy={busy} onOpen={openPayment} />
        <section className="card stack"><h2>Who pays whom</h2>
          {settlement.transactions.length === 0 ? <EmptyState title="No payments needed" description="These expenses balance out." /> : <PaymentTable groupId={groupId} userId={user?.id} busy={busy} items={settlement.transactions} onOpen={openPayment} />}
        </section>
        <section className="card settlement-progress" aria-label="Payment progress">
          <h2>Payment progress</h2>
          <label htmlFor="payment-progress">{confirmed} of {countLabel(transactions.length, 'payment')} confirmed</label>
          <progress id="payment-progress" value={transactions.length ? confirmed : 1} max={transactions.length || 1} />
          {settlement.status === 'completed' && <p><strong data-settlement-status={settlement.status}>Settlement complete</strong></p>}
        </section>
        <PaymentSummary items={settlement.transactions} userId={user?.id} />
        <details className="card settlement-more-details"><summary>More details</summary>
          <p>Total to pay across the group: <Money value={totalAmount} /></p>
          {settlement.status !== 'completed' && <p>{transactions.length - confirmed - waiting} pending; {waiting} awaiting confirmation</p>}
          <p className="muted">{settlement.status === 'completed' ? 'All payments are confirmed and saved in history.' : 'Pay outside Splitter; each receiver must confirm before this is complete.'}</p>
        <details><summary>Included expenses</summary><p>Settlement #{settlement.sequence_number}</p><h2>Included expenses</h2><p>These expenses and payments cannot be changed.</p>
          <ul>{settlement.expense_ids.map((id, index) => <li key={id}><Link to={`/groups/${groupId}?expense=${id}`}>View included expense {index + 1}</Link></li>)}</ul>
        </details>
        <details><summary>Settlement history</summary><p>Created: <time dateTime={settlement.created_at}>{new Date(settlement.created_at).toLocaleString()}</time></p>{settlement.completed_at && <p>All payments confirmed: <time dateTime={settlement.completed_at}>{new Date(settlement.completed_at).toLocaleString()}</time></p>}<Link to={`/groups/${groupId}/history?tab=settlements`}>View settlement history</Link></details>
        </details>
      </>)}
    </ResourceState>
  </div>;
}
