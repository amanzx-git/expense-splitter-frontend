import { userHandle } from '../../utils/identity.js';
import { Link } from 'react-router-dom';
import { getSettlement } from '../../api/settlements.js';
import { useGroupResource, ResourceState } from '../groups/resources.jsx';
import UserAvatar from '../../components/UserAvatar.jsx';
import Money from '../../components/Money.jsx';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import { paymentEvents } from './activity.js';
import { useContext } from 'react';
import { AuthContext } from '../../context/AuthContext.jsx';
import { PaymentDirection, paymentStatusLabel } from '../settlements/paymentPresentation.jsx';

export default function PaymentEvents({ groupId, settlementId, limit, instructions = false, currentState = false }) {
  const auth = useContext(AuthContext);
  const detail = useGroupResource((signal) => getSettlement(settlementId, signal), [settlementId, groupId]);
  const settlement = detail.data?.settlement;
  if (settlement && settlement.group_id !== groupId) return <ErrorMessage message="Settlement not found in this group." />;
  const events = paymentEvents(settlement?.transactions);
  return <ResourceState resource={detail}>
    {settlement && <>
      {currentState ? <>
        {!settlement.transactions.length && <p>No payments needed.</p>}
        <ul className="plain-list history-payments">{settlement.transactions.map((item) => <li key={item.id} className="history-payment-row"><UserAvatar user={item.payer} decorative /><div><p><PaymentDirection item={item} userId={auth?.user?.id} /></p><span className="status-pill">{paymentStatusLabel(item.status, item, auth?.user?.id)}</span></div></li>)}</ul>
      </> : <>
      {instructions && <ul className="plain-list payment-instructions">{settlement.transactions.filter((item) => item.status !== 'done' && [item.payer.id, item.receiver.id].includes(auth?.user?.id)).map((item) => <li key={item.id}>
        <p><PaymentDirection item={item} userId={auth.user.id} /></p>
        <p className="muted">{paymentStatusLabel(item.status, item, auth?.user?.id)}</p>
        {(item.payer.id === auth.user.id && item.status === 'pending' || item.receiver.id === auth.user.id && item.status === 'payment_reported') && <Link className="btn btn-primary" to={`/groups/${groupId}/settlements/${settlementId}`}>{item.payer.id === auth.user.id ? "I've paid" : 'Confirm money received'}</Link>}
      </li>)}</ul>}
      {events.length === 0 && <p className="muted">No payments marked as paid yet.</p>}
      <ul className="plain-list activity-list">{events.slice(0, limit ?? events.length).map((event) => <li key={event.id} className="list-item">
        <UserAvatar user={event.user} decorative />
        <div className="list-item-main"><p>{userHandle(event.user)} {event.label} {userHandle(event.receiver)} · <Money value={event.amount} /></p>
          <p className="muted"><span className="status-pill">{event.status}</span> <time dateTime={event.at}>{new Date(event.at).toLocaleString()}</time></p>
        </div>
      </li>)}</ul>
      </>}
      <Link to={`/groups/${groupId}/settlements/${settlementId}`}>{settlement.status === 'pending' ? 'View payment actions' : 'View settlement details'}</Link>
    </>}
  </ResourceState>;
}
