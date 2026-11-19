import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { usePaymentActions } from './PaymentActionsProvider.jsx';
import { PaymentAmount, personName } from './paymentPresentation.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import Icon from '../../components/Icon.jsx';

export default function PaymentIndicators() {
  const resource = usePaymentActions();
  const { user } = useAuth();
  const [open, setOpen] = useState(null);
  const root = useRef(null);
  const triggers = useRef({});
  const id = useId();
  const { pathname } = useLocation();
  useEffect(() => { setOpen(null); }, [pathname, user?.id]);
  const actions = resource?.data?.actions ?? [];
  const pay = actions.filter((action) => action.type === 'pay');
  const confirm = actions.filter((action) => action.type === 'confirm');
  const items = open === 'pay' ? pay : confirm;
  useEffect(() => {
    if (!open) return;
    const dismiss = (event) => {
      if (event.type === 'keydown' && event.key === 'Escape') { setOpen(null); triggers.current[open]?.focus(); }
      else if (event.type === 'pointerdown' && !root.current?.contains(event.target)) setOpen(null);
    };
    document.addEventListener('keydown', dismiss);
    document.addEventListener('pointerdown', dismiss);
    return () => { document.removeEventListener('keydown', dismiss); document.removeEventListener('pointerdown', dismiss); };
  }, [open]);
  if (!resource) return null;
  return <div className="payment-indicators" ref={root}>
    {[[ 'pay', pay, 'Payments to make', 'wallet' ], [ 'confirm', confirm, 'Payments to confirm', 'check' ]].map(([type, list, label, icon]) => list.length > 0 &&
      <button key={type} type="button" className="btn btn-secondary payment-indicator" ref={(node) => { triggers.current[type] = node; }}
        aria-label={`${label}, ${list.length}`} title={label} aria-expanded={open === type} aria-controls={`${id}-payments`}
        onClick={() => setOpen((value) => value === type ? null : type)}><Icon name={icon} /><span aria-hidden="true">{list.length}</span></button>)}
    {open && items.length > 0 && <section className="payment-indicator-panel card stack" id={`${id}-payments`} aria-label={open === 'pay' ? 'Payments to make' : 'Payments to confirm'}>
      <div className="section-heading"><strong>{open === 'pay' ? 'Payments to make' : 'Payments to confirm'}</strong><button type="button" className="btn btn-secondary" aria-label="Close payment indicators" onClick={() => { setOpen(null); triggers.current[open]?.focus(); }}><span aria-hidden="true">&#215;</span></button></div>
      <ul className="plain-list">{items.map((action) => <li key={action.item.id}><Link className="payment-indicator-item" to={action.href} onClick={() => setOpen(null)}>
        <div className="payment-card-top"><strong title={action.group.name}>{action.group.name}</strong><small className="muted">{action.type === 'pay' ? 'Payment pending' : 'Awaiting confirmation'}</small></div>
        <div className="payment-card-bottom"><div className="payment-card-copy">
          <span>{action.type === 'pay' ? `Pay ${personName(action.item.receiver)}` : `Confirm from ${personName(action.item.payer)}`}</span>
          <PaymentAmount item={action.item} userId={user?.id} />
        </div><span className="payment-card-chevron" aria-hidden="true">&#8250;</span></div>
      </Link></li>)}</ul>
    </section>}
    {(resource.error || resource.data?.failed) && <button type="button" className="btn btn-secondary" title="Could not load all payment actions. Retry" aria-label="Retry payment indicators" onClick={resource.refresh}>!</button>}
  </div>;
}
