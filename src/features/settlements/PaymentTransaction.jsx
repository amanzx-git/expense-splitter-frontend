import MemberIdentity from '../groups/MemberIdentity.jsx';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../hooks/useAuth.js';

import Button from '../../components/Button.jsx';
import { validPaymentUri } from './paymentUri.js';
import UserAvatar from '../../components/UserAvatar.jsx';
import { PaymentDirection, paymentStatusLabel } from './paymentPresentation.jsx';

export default function PaymentTransaction({ item, settlementStatus, busy, onAction, groupId }) {
  const { user } = useAuth();
  const isPayer = user?.id === item.payer.id;
  const isReceiver = user?.id === item.receiver.id;
  const payment = isPayer ? validPaymentUri(item.payment, item.amount) : null;
  return <div className="stack payment-transaction">
    {isPayer && item.status === 'pending' && settlementStatus === 'pending' && <section className="stack" aria-label="How to pay"><h2>How to pay</h2>{payment ? <div className="stack">
      <p>Send to: {payment.name || '@'+item.receiver.username} ({payment.upiId})</p>
      <QRCodeSVG value={payment.uri} size={180} title={`UPI payment QR for @${item.receiver.username}`} role="img" />
      <p><a href={payment.uri}>Open UPI app</a></p>
      <p className="muted">Pay in your UPI app. The receiver must confirm receipt.</p>
    </div> : <p className="muted">No UPI details. Ask the receiver how to pay.</p>}</section>}
    {settlementStatus === 'pending' && isPayer && item.status === 'pending' && <Button disabled={busy} onClick={() => onAction(item, 'report')}>I've paid</Button>}
    {settlementStatus === 'pending' && isReceiver && item.status === 'payment_reported' && <Button disabled={busy} onClick={() => onAction(item, 'confirm')}>Confirm money received</Button>}
    <details><summary>Details</summary>
    <div className="row" aria-label="Payment participants"><MemberIdentity groupId={groupId} user={item.payer}><UserAvatar user={item.payer} decorative />@{item.payer.username}</MemberIdentity><span aria-hidden="true">→</span><MemberIdentity groupId={groupId} user={item.receiver}><UserAvatar user={item.receiver} decorative />@{item.receiver.username}</MemberIdentity></div>
    <p className="payment-summary"><PaymentDirection item={item} userId={user?.id} /></p>
    <p><strong className={`status-pill status-${item.status}`} data-payment-status={item.status}>{paymentStatusLabel(item.status, item, user?.id)}</strong></p>
      <h3>Payment history</h3>
      {!item.reported_at && !item.confirmed_at && <p>No payment updates yet.</p>}
      {item.reported_at && <p>Marked as paid: <time dateTime={item.reported_at}>{new Date(item.reported_at).toLocaleString()}</time></p>}
      {item.confirmed_at && <p>Received: <time dateTime={item.confirmed_at}>{new Date(item.confirmed_at).toLocaleString()}</time></p>}
    </details>
  </div>;
}
