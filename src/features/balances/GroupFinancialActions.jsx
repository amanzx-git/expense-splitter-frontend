import { createPortal } from 'react-dom';
import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext.jsx';
import { getBalances } from '../../api/balances.js';
import { listSettlements, getSettlement } from '../../api/settlements.js';
import { useGroupResource, ResourceState } from '../groups/resources.jsx';
import GenerateSettlement from '../settlements/GenerateSettlement.jsx';
import Money from '../../components/Money.jsx';
import Button from '../../components/Button.jsx';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import { PaymentDirection, balanceDirectionClass } from '../settlements/paymentPresentation.jsx';

function ActivePayments({ groupId, id, userId }) {
  const resource = useGroupResource((signal) => getSettlement(id, signal), [id, groupId]);
  const settlement = resource.data?.settlement;
  if (settlement && settlement.group_id !== groupId) return <ErrorMessage message="Settlement not found in this group." />;
  const payments = settlement?.transactions.filter((item) => item.status !== 'done' && [item.payer.id, item.receiver.id].includes(userId)) ?? [];
  const item = payments.length === 1 ? payments[0] : null;
  return <ResourceState resource={resource}>{settlement && <div className="outstanding-payments">
    {item ? <>
      <p className="personal-balance"><PaymentDirection item={item} userId={userId} /></p>
      {item.status === 'payment_reported' && <p className="muted">Waiting for confirmation</p>}
    </> : <p>{payments.length > 1 ? `You have ${payments.length} payments to review` : userId ? "You're all settled!" : 'There are group payments to review.'}</p>}
    <div className="balance-payment-links"><Link to={`/groups/${groupId}/settlements/${id}`}>View official statement</Link>
    {item && (item.payer.id === userId && item.status === 'pending' || item.receiver.id === userId && item.status === 'payment_reported') && <Link className="btn btn-secondary payment-action" to={`/groups/${groupId}/settlements/${id}?payment=${item.id}`}>{item.payer.id === userId ? "I've paid" : 'Confirm money received'}</Link>}</div>
  </div>}</ResourceState>;
}

export default function GroupFinancialActions({ group, revision, onChanged, onAdd, busy, settlementTarget }) {
  const auth = useContext(AuthContext);
  const preview = useGroupResource((signal) => getBalances(group.id, signal), [group.id, revision]);
  const history = useGroupResource((signal) => listSettlements(group.id, 1, signal), [group.id, revision]);
  const latest = history.data?.results[0];
  const active = latest?.status === 'pending';
  const member = preview.data?.members.find((item) => item.user.id === auth?.user?.id);
  return <footer className="conversation-actions" aria-label="Group actions">
    <section className="bottom-balance" aria-label="Your balance"><h2>Your balance</h2>
      <ResourceState resource={preview}>{preview.data && <>
        {member ? member.net_balance === '0.00' ? (!history.loading && !history.error && !active && !preview.data.blockers.includes('ACTIVE_SETTLEMENT_EXISTS') ? <p>You're all settled!</p> : <p className="muted">No payments from new expenses.</p>) : <p className="unsettled-preview">From new expenses: {member.net_balance.startsWith('-') ? 'You will pay' : 'You will receive'} <Money className={balanceDirectionClass(member.net_balance)} value={member.net_balance.startsWith('-') ? member.net_balance.slice(1) : member.net_balance} /></p> : <p>New shared expenses: <Money value={preview.data.unsettled_expense_total} /></p>}
      </>}</ResourceState>
      <ResourceState resource={history}>
        {active ? <ActivePayments key={`${latest.id}:${revision}`} groupId={group.id} id={latest.id} userId={auth?.user?.id} /> : null}
      </ResourceState>
    </section>
    <div className="financial-action-buttons">
    <Link className="btn btn-secondary balance-details" to={`/groups/${group.id}?panel=balances`}>View everyone's balance</Link>
    {settlementTarget && createPortal(<GenerateSettlement group={group} preview={{ ...preview, loading: preview.loading || history.loading, error: preview.error || history.error, data: preview.data && { ...preview.data, can_generate_settlement: preview.data.can_generate_settlement && !active, blockers: active ? [...new Set([...preview.data.blockers, 'ACTIVE_SETTLEMENT_EXISTS'])] : preview.data.blockers } }} onChanged={onChanged} compact />, settlementTarget)}
    <Button onClick={onAdd} disabled={busy}>Add an expense</Button>
    </div>
  </footer>;
}
