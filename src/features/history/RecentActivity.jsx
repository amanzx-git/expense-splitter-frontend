import { userHandle } from '../../utils/identity.js';
import { Link } from 'react-router-dom';
import { listSettlements } from '../../api/settlements.js';
import { useGroupResource, ResourceState, Pagination } from '../groups/resources.jsx';
import UserAvatar from '../../components/UserAvatar.jsx';
import Money from '../../components/Money.jsx';
import Button from '../../components/Button.jsx';
import PaymentEvents from './PaymentEvents.jsx';
import { newestExpenses } from './activity.js';
import { useContext, useLayoutEffect, useRef, useState } from 'react';
import { chronologicalExpenses } from './conversation.js';
import { AuthContext } from '../../context/AuthContext.jsx';

export default function RecentActivity({ groupId, expenses, revision, onExpense, conversation = false, page, onPage, message, headingRef }) {
  const auth = useContext(AuthContext);
  const feed = useRef(null);
  const position = useRef({ near: true, top: 0, ids: new Set(), message: null, height: 0 });
  const [unseen, setUnseen] = useState(false);
  const [visible, setVisible] = useState(20);
  const older = useRef(false);
  function bottom() {
    const node = feed.current;
    if (node) { node.scrollTop = node.scrollHeight; position.current.near = true; setUnseen(false); }
  }
  useLayoutEffect(() => {
    if (!conversation || expenses.loading || !expenses.data) return;
    const node = feed.current, previous = position.current;
    const ids = new Set(expenses.data.results.map((item) => item.id));
    const addedCount = [...ids].filter((id) => !previous.ids.has(id)).length;
    const added = addedCount > 0;
    if (older.current) { node.scrollTop = previous.top + node.scrollHeight - previous.height; older.current = false; }
    else if (!previous.ids.size || (message && message !== previous.message) || previous.near) bottom();
    else { node.scrollTop = previous.top; if (added) { setUnseen(true); setVisible((count) => count + addedCount); } }
    position.current.ids = ids;
    position.current.message = message;
  }, [conversation, expenses.data, expenses.loading, visible, message]);
  const settlements = useGroupResource((signal) => conversation ? Promise.resolve(null) : listSettlements(groupId, 1, signal), [groupId, revision, conversation]);
  const latest = settlements.data?.results[0];
  const payments = <div className="stack payment-activity">
    <h3>Payments in the latest settlement</h3>
    <ResourceState resource={settlements}>
      {!latest && <p className="muted">No settlements yet.</p>}
      {latest && (latest.transaction_count > 0 ? <PaymentEvents key={`${latest.id}:${revision}`} groupId={groupId} settlementId={latest.id} limit={2} instructions={conversation} /> : <p>No payments needed. <Link to={`/groups/${groupId}/settlements/${latest.id}`}>View settlement #{latest.sequence_number}</Link></p>)}
    </ResourceState>
  </div>;
  return <section ref={feed} onScroll={() => { if (!expenses.loading && feed.current) { const node = feed.current; position.current.top = node.scrollTop; position.current.near = node.scrollHeight - node.scrollTop - node.clientHeight < 80; if (position.current.near) setUnseen(false); } }} className={conversation ? 'conversation-feed stack' : 'card stack'} aria-label="Group activity" tabIndex={conversation ? 0 : undefined}>
    <div className="section-heading"><h2 ref={headingRef} tabIndex={-1}>Group activity</h2><Link to={`/groups/${groupId}/history`}>View history</Link></div>
    {message && <p className="notice" role="status">{message}</p>}
    {conversation && expenses.data?.completed && <p className="muted">Previous payments completed. <Link to={`/groups/${groupId}/history`}>View history</Link></p>}
    {conversation && unseen && <Button className="new-expenses-indicator" onClick={bottom}>New expenses ↓</Button>}
    <h3>Expenses</h3>
    <ResourceState resource={expenses}>
      {expenses.data?.results.length === 0 && <div className="muted"><h3>No expenses yet</h3><p>Add one to get started.</p></div>}
      {conversation && expenses.data?.results.length > visible && <Button variant="secondary" onClick={() => { older.current = true; position.current.height = feed.current.scrollHeight; position.current.top = feed.current.scrollTop; setVisible((count) => count + 20); }}>Show older expenses</Button>}
      <ul className="plain-list activity-list">{(conversation ? chronologicalExpenses(expenses.data?.results).slice(-visible) : newestExpenses(expenses.data?.results).slice(0, 3)).map((expense) => <li key={expense.id} className={conversation ? `expense-message-row${expense.paid_by?.id && String(expense.paid_by.id) === String(auth?.user?.id) ? ' expense-message-row--own' : ''}` : 'list-item'}>
        <UserAvatar user={expense.paid_by} decorative />
        {conversation ? <button className="expense-message" aria-label={expense.description} onClick={(event) => onExpense(expense.id, event.currentTarget)}>
          <span className="expense-card-payer">{userHandle(expense.paid_by)} paid</span><Money value={expense.amount} />
          <strong className="expense-card-description" title={expense.description}>{expense.description}</strong>
          <time dateTime={expense.created_at} title={new Date(expense.created_at).toLocaleString()}>{new Date(expense.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
        </button> : <div className="list-item-main"><Button variant="secondary" onClick={(event) => onExpense(expense.id, event.currentTarget)}>{expense.description}</Button>
          <p>{userHandle(expense.paid_by)} paid · <Money value={expense.amount} /></p>
          <time className="muted" dateTime={expense.created_at}>{new Date(expense.created_at).toLocaleString()}</time>
        </div>}
      </li>)}</ul>
      {conversation && <Pagination data={expenses.data} page={page} onPage={onPage} />}
    </ResourceState>
    {!conversation && payments}
  </section>;
}
