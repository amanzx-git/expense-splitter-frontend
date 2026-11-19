import { Link } from 'react-router-dom';
import { usePaymentActions } from './PaymentActionsProvider.jsx';
import { PaymentAmount } from './paymentPresentation.jsx';
import { useAuth } from '../../hooks/useAuth.js';

export default function GroupPaymentAttention({ groupId }) {
  const resource = usePaymentActions();
  const { user } = useAuth();
  const actions = resource?.data?.actions.filter((action) => action.group.id === groupId) ?? [];
  if (!actions.length) return null;
  const pay = actions.filter((action) => action.type === 'pay');
  const confirm = actions.filter((action) => action.type === 'confirm');
  return <div className="group-payment-attention stack" aria-label="Settlement actions">
    <strong>{pay.length && confirm.length ? 'Action needed' : pay.length ? 'Payment pending' : 'Confirm payment'}</strong>
    {pay.length > 0 && <span>{pay.length} to pay</span>}
    {confirm.length > 0 && <span>{confirm.length} to confirm</span>}
    <ul className="plain-list">{actions.map((action) => <li key={action.item.id}>{action.type === 'pay' ? 'Pay' : 'Confirm receipt'}: <PaymentAmount item={action.item} userId={user?.id} /></li>)}</ul>
    <Link to={`/groups/${groupId}/settlements/${actions[0].settlementId}`}>View official statement</Link>
  </div>;
}
