import Button from '../../components/Button.jsx';
import { PaymentAmount, personName } from './paymentPresentation.jsx';

export default function PaymentAttention({ settlement, userId, busy, onOpen }) {
  if (settlement.status !== 'pending') return null;
  const confirmations = settlement.transactions.filter((item) => item.receiver.id === userId && item.status === 'payment_reported');
  const payments = settlement.transactions.filter((item) => item.payer.id === userId && item.status === 'pending');
  const actions = [...confirmations, ...payments];
  if (!actions.length) return null;
  return <section className="card stack settlement-attention" aria-label="Action needed">
    <div className="section-heading"><h2>Action needed</h2><span className="attention-label">{actions.length} {actions.length === 1 ? 'payment' : 'payments'}</span></div>
    <ul className="plain-list attention-payments">{actions.map((item) => {
      const confirm = item.receiver.id === userId;
      return <li key={item.id} className="attention-payment">
        <div>
          <p className="attention-amount"><PaymentAmount item={item} userId={userId} /></p>
          <p>{confirm ? 'Confirm receipt from' : 'Pay'} <strong>{personName(confirm ? item.payer : item.receiver)}</strong></p>
        </div>
        <Button disabled={busy} aria-label={`View payment ${confirm ? 'from' : 'to'} ${personName(confirm ? item.payer : item.receiver)} for ${item.amount}`} onClick={(event) => onOpen(item.id, event.currentTarget)}>View payment</Button>
      </li>;
    })}</ul>
  </section>;
}
