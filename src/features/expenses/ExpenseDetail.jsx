import { countLabel } from '../../utils/wording.js';
import { userHandle } from '../../utils/identity.js';
import MemberIdentity from '../groups/MemberIdentity.jsx';
import { useState } from 'react';
import * as api from '../../api/expenses.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useGroupResource, ResourceState } from '../groups/resources.jsx';
import { describeActionError } from '../../utils/apiErrors.js';
import { formatCalendarDate } from '../../utils/dates.js';
import Button from '../../components/Button.jsx';
import Money from '../../components/Money.jsx';
import FormAlert from '../../components/FormAlert.jsx';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import Comments from './Comments.jsx';
import UserAvatar from '../../components/UserAvatar.jsx';

export default function ExpenseDetail({ id, group, onChanged, onDeleted, onBusy }) {
  const { user } = useAuth();
  const detail = useGroupResource((signal) => api.getExpense(id, signal), [id]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const expense = detail.data?.expense;
  const canChange = expense && expense.group_id === group.id && expense.settlement_id === null && !!user?.id && expense.paid_by?.id === user.id;
  async function remove() {
    if (busy) return;
    setBusy(true); setError(null);
    onBusy?.(true);
    try { await api.deleteExpense(id); onDeleted(); }
    catch (err) {
      setError(describeActionError(err, 'delete this expense')); setConfirming(false);
      if ([403, 404, 409].includes(err.status)) { detail.refresh(); onChanged(); }
    } finally { setBusy(false); onBusy?.(false); }
  }
  return <div className="stack">
    <FormAlert message={error?.message} items={error?.other} hint={error?.hint} />
    <ResourceState resource={detail}>
      {expense && expense.group_id !== group.id ? <ErrorMessage message="Expense not found in this group." /> : expense && <>
        <h3>{expense.description}</h3>
        <p className="expense-detail-total"><Money value={expense.amount} /></p>
        <p className="identity"><MemberIdentity groupId={group.id} user={expense.paid_by}><UserAvatar user={expense.paid_by} decorative /><span>Paid by {expense.paid_by.full_name || '@'+expense.paid_by.username}</span></MemberIdentity></p>
        <h3>Shared by {countLabel(expense.shares.length, 'person', 'people')}</h3>
        <ul className="plain-list expense-share-list" aria-label="Participant shares">{expense.shares.map((share) => <li className="expense-share-row" key={share.user.id}><UserAvatar user={share.user} decorative /><span className="expense-share-name" title={userHandle(share.user)}>{userHandle(share.user)}</span><Money value={share.amount} /></li>)}</ul>
        <details className="expense-metadata"><summary>More details</summary>
          {expense.created_by && <p><MemberIdentity groupId={group.id} user={expense.created_by}>Added by: {userHandle(expense.created_by)}</MemberIdentity></p>}
          <p>Expense date: <time dateTime={expense.expense_date}>{formatCalendarDate(expense.expense_date)}</time></p>
          <p>Created: <time dateTime={expense.created_at}>{new Date(expense.created_at).toLocaleString()}</time></p>
          <p>{expense.settlement_id ? 'Included in a settlement' : 'Not yet included in a settlement'}</p>
        </details>
        {canChange && !confirming && <div className="row">
          <Button variant="danger" onClick={() => setConfirming(true)}>Delete expense</Button>
        </div>}
        {canChange && confirming && <section className="notice stack" aria-label="Delete confirmation">
          <div className="modal-heading"><p>This expense will be deleted. You cannot undo this.</p><button type="button" className="btn btn-secondary" aria-label="Close delete confirmation" disabled={busy} onClick={() => setConfirming(false)}>×</button></div>
          <div className="row"><Button variant="danger" loading={busy} onClick={remove}>{busy ? 'Deleting expense…' : 'Confirm delete'}</Button><Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>Keep expense</Button></div>
        </section>}
        <Comments key={`comments-${expense.id}`} groupId={group.id} expenseId={expense.id} onUnavailable={detail.refresh} />
      </>}
    </ResourceState>
  </div>;
}
