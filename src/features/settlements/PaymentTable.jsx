import { useId } from 'react';
import UserAvatar from '../../components/UserAvatar.jsx';
import { personName, PaymentAmount } from './paymentPresentation.jsx';

export default function PaymentTable({ items, onOpen, userId, busy = false }) {
  const prefix = useId();
  return <ul className="plain-list compact-payments" aria-label="Group payments">
    {items.map((item) => <li key={item.id}>
      <button type="button" className="compact-payment-row" data-payment-id={item.id}
        disabled={busy}
        aria-label={`View payment from ${personName(item.payer)} to ${personName(item.receiver)}`}
        aria-describedby={`${prefix}-${item.id}-amount ${prefix}-${item.id}-status`}
        onClick={(event) => onOpen(item.id, event.currentTarget)}>
        <UserAvatar user={item.payer} decorative />
        <span className="compact-payment-copy">
          <span className="compact-payment-names">
            <span title={personName(item.payer)}>{personName(item.payer)}</span>
            <span aria-hidden="true">&#8594;</span>
            <span title={personName(item.receiver)}>{personName(item.receiver)}</span>
          </span>
          <span id={`${prefix}-${item.id}-status`} className="compact-payment-status" data-payment-status={item.status}>
            {{ pending: 'Pending', payment_reported: 'Awaiting confirmation', done: 'Completed' }[item.status] || 'Status unavailable'}
          </span>
        </span>
        <span className="compact-payment-amount" id={`${prefix}-${item.id}-amount`}><PaymentAmount item={item} userId={userId} /></span>
        <span className="compact-payment-chevron" aria-hidden="true">&#8250;</span>
      </button>
    </li>)}
  </ul>;
}
