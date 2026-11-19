import Money from '../../components/Money.jsx';

export function paymentStatusLabel(status, item, userId) {
  const payer = userId && item?.payer.id === userId;
  const receiver = userId && item?.receiver.id === userId;
  if (status === 'done') return 'Payment completed';
  if (status === 'pending') return payer ? 'Not paid yet' : receiver ? 'Waiting for payment' : 'Not paid yet';
  if (status === 'payment_reported') return payer ? 'Waiting for receiver to confirm' : receiver ? 'Confirm the money arrived' : 'Waiting for confirmation';
  return 'Status unavailable';
}
export const settlementStatusLabel = (status) => ({ pending: 'Payments to complete', completed: 'All payments confirmed' }[status] || 'Status unavailable');
export const personName = (person) => person.is_deleted ? 'Deleted member' : person.full_name || person.username;

export function paymentDirectionClass(item, userId) {
  if (!userId || !['pending', 'payment_reported'].includes(item.status)) return '';
  if (String(item.payer?.id) === String(userId)) return 'payment-direction--outgoing';
  if (String(item.receiver?.id) === String(userId)) return 'payment-direction--incoming';
  return '';
}

export function balanceDirectionClass(value) {
  return /^-?0(?:\.00)?$/.test(value || '') || !value ? '' : value.startsWith('-') ? 'payment-direction--outgoing' : 'payment-direction--incoming';
}

export function PaymentDirection({ item, userId }) {
  return <span><DirectionText item={item} userId={userId} /></span>;
}

export function PaymentAmount({ item, userId }) {
  return <Money value={item.amount} className={paymentDirectionClass(item, userId)} />;
}

function DirectionText({ item, userId }) {
  const payer = personName(item.payer), receiver = personName(item.receiver);
  if (item.payer.id === userId) {
    if (item.status === 'payment_reported') return <>You marked <PaymentAmount item={item} userId={userId} /> as paid to {receiver}</>;
    return <>You {item.status === 'done' ? 'paid' : 'will pay'} {receiver} <PaymentAmount item={item} userId={userId} /></>;
  }
  if (item.status === 'payment_reported') return <>{payer} marked <PaymentAmount item={item} userId={userId} /> as paid to {item.receiver.id === userId ? 'you' : receiver}</>;
  if (item.receiver.id === userId) return <>You {item.status === 'done' ? 'received' : 'will receive'} <PaymentAmount item={item} userId={userId} /> from {payer}</>;
  return <>{payer} {item.status === 'done' ? 'paid' : 'will pay'} {receiver} <PaymentAmount item={item} userId={userId} /></>;
}

export function PaymentSummary({ items, userId }) {
  const involved = items.filter((item) => [item.payer.id, item.receiver.id].includes(userId));
  const outstanding = involved.filter((item) => item.status !== 'done');
  // Required tasks already appear in Action needed; keep this summary informational.
  const relevant = outstanding.filter((item) => !(item.payer.id === userId && item.status === 'pending') && !(item.receiver.id === userId && item.status === 'payment_reported'));
  if (!involved.length || (outstanding.length && !relevant.length)) return null;
  return <section className="card stack personal-payment-summary" aria-label="Your payments"><h2>Your payment details</h2>
    {relevant.length ? <ul className="plain-list">{relevant.map((item) => <li key={item.id}><p><PaymentDirection item={item} userId={userId} /></p><span className="muted">{paymentStatusLabel(item.status, item, userId)}</span></li>)}</ul> : <p>You're all settled!</p>}
  </section>;
}
