import { countLabel } from '../utils/wording.js';
import { userHandle } from '../utils/identity.js';
import Select from '../components/Select.jsx';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getGroup } from '../api/groups.js';
import { listExpenses } from '../api/expenses.js';
import { listSettlements } from '../api/settlements.js';
import { useGroupResource, ResourceState, Pagination } from '../features/groups/resources.jsx';
import { newestExpenses } from '../features/history/activity.js';
import PaymentEvents from '../features/history/PaymentEvents.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import Money from '../components/Money.jsx';
import Button from '../components/Button.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { settlementStatusLabel } from '../features/settlements/paymentPresentation.jsx';
import { allPages } from '../features/history/conversation.js';

function History({ groupId }) {
  const [params] = useSearchParams();
  const [tab, setTab] = useState(() => params.get('tab') === 'settlements' ? 'Settlements' : 'Expenses');
  const [expensePage, setExpensePage] = useState(1);
  const [status, setStatus] = useState('');
  const [settlementPage, setSettlementPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [previousOnly, setPreviousOnly] = useState(false);
  const completed = useGroupResource((signal) => allPages((page) => listSettlements(groupId, page, signal)), [groupId]);
  const completedIds = new Set(completed.data?.filter((item) => item.status === 'completed').map((item) => item.id));
  const expenses = useGroupResource(async (signal) => {
    if (!previousOnly) return listExpenses(groupId, expensePage, status, signal);
    const rows = newestExpenses(await allPages((page) => listExpenses(groupId, page, 'settled', signal))).filter((item) => completedIds.has(item.settlement_id));
    return { results: rows.slice((expensePage - 1) * 20, expensePage * 20), count: rows.length, next: expensePage * 20 < rows.length, previous: expensePage > 1 };
  }, [groupId, expensePage, status, previousOnly, previousOnly ? completed.data : null]);
  const settlements = useGroupResource((signal) => listSettlements(groupId, settlementPage, signal), [groupId, settlementPage]);
  return <>
    <div className="history-tabs" role="tablist" aria-label="Group history sections">{['Expenses', 'Settlements', 'Payments'].map((name, index, names) => <button key={name} type="button" role="tab" id={`history-tab-${name}`} aria-selected={tab === name} aria-controls={`history-panel-${name}`} tabIndex={tab === name ? 0 : -1} onClick={() => setTab(name)} onKeyDown={(event) => {
      const next = event.key === 'ArrowRight' ? names[(index + 1) % names.length] : event.key === 'ArrowLeft' ? names[(index + names.length - 1) % names.length] : event.key === 'Home' ? names[0] : event.key === 'End' ? names.at(-1) : null;
      if (next) { event.preventDefault(); setTab(next); document.getElementById(`history-tab-${next}`)?.focus(); }
    }}>{name}</button>)}</div>
    <div role="tabpanel" id="history-panel-Expenses" aria-labelledby="history-tab-Expenses" hidden={tab !== 'Expenses'}>
    <section className="history-section stack" aria-label="Expense history"><h2>{previousOnly ? 'Previous expenses' : 'Expenses'}</h2>
      <ResourceState resource={completed}><label><input type="checkbox" checked={previousOnly} disabled={completed.loading || !!completed.error} onChange={(event) => { setPreviousOnly(event.target.checked); setExpensePage(1); setStatus(event.target.checked ? 'settled' : ''); }} /> Only expenses from completed settlements</label></ResourceState>
      {previousOnly && <p className="muted">Completed expenses cannot be changed.</p>}
      {!previousOnly && <div className="field"><label htmlFor="history-expense-status">Expense status</label><Select id="history-expense-status" value={status} onChange={(event) => { setStatus(event.target.value); setExpensePage(1); }}><option value="">All expenses</option><option value="unsettled">New expenses</option><option value="settled">Included in a settlement</option></Select></div>}
      <ResourceState resource={expenses}>
        {!expenses.data?.results.length && <EmptyState title="No expense history yet" />}
        <ul className="plain-list history-expenses">{newestExpenses(expenses.data?.results).filter((expense) => !previousOnly || completedIds.has(expense.settlement_id)).map((expense, index, rows) => <li className="history-expense-entry" key={expense.id}>
          {(index === 0 || rows[index - 1].created_at.slice(0, 10) !== expense.created_at.slice(0, 10)) && <h3 className="history-date">{new Date(expense.created_at).toLocaleDateString([], { dateStyle: 'medium', timeZone: 'UTC' })} <span className="muted">UTC</span></h3>}
          <div className={`history-expense-row${completedIds.has(expense.settlement_id) ? ' history-expense-row--archived' : ''}`}><UserAvatar user={expense.paid_by} decorative /><div className="list-item-main">
            <div className="history-row-heading"><Link title={expense.description} to={`/groups/${groupId}?expense=${expense.id}`}>{expense.description}</Link><Money value={expense.amount} /></div>
            <small className="muted">Paid by {userHandle(expense.paid_by)} · <time dateTime={expense.created_at}>{new Date(expense.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>{expense.settlement_id && ' · Included in a settlement'}</small>
            {completedIds.has(expense.settlement_id) && <span className="status-pill archived-label">Completed</span>}
          </div>
          </div></li>)}</ul>
        <Pagination data={expenses.data} page={expensePage} onPage={setExpensePage} />
      </ResourceState>
    </section>
    </div>
    <div role="tabpanel" id="history-panel-Settlements" aria-labelledby="history-tab-Settlements" hidden={tab !== 'Settlements'}><section className="history-section stack" aria-label="Settlement history"><h2>Settlements</h2><ResourceState resource={settlements}>
      {!settlements.data?.results.length && <EmptyState title="No settlements yet" />}
      <ul className="plain-list">{settlements.data?.results.map((item) => <li className="history-settlement-row" key={item.id}><div className="history-row-heading"><Link to={`/groups/${groupId}/settlements/${item.id}`}>Settlement #{item.sequence_number}</Link><span className="status-pill">{settlementStatusLabel(item.status)}</span></div><small className="muted"><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString()}</time> · {countLabel(item.expense_count, 'expense')} · {item.confirmed_transaction_count} of {countLabel(item.transaction_count, 'payment')} confirmed</small>{item.completed_at && <small className="muted">Completed {new Date(item.completed_at).toLocaleDateString()}</small>}</li>)}</ul>
      <Pagination data={settlements.data} page={settlementPage} onPage={setSettlementPage} />
    </ResourceState></section></div>
    <div role="tabpanel" id="history-panel-Payments" aria-labelledby="history-tab-Payments" hidden={tab !== 'Payments'}>
    <section className="history-section stack" aria-label="Payment history"><h2>Payments</h2>
      <p className="muted">Payments happen outside Splitter; receivers confirm when the money arrives.</p>
      <ResourceState resource={settlements}>
        {!settlements.data?.results.length && <EmptyState title="No payment history yet" />}
        <ul className="plain-list">{settlements.data?.results.map((item) => <li key={item.id} className="list-item"><div className="stack list-item-main">
          <Link to={`/groups/${groupId}/settlements/${item.id}`}>Settlement #{item.sequence_number}</Link>
          <p><span className="status-pill">{settlementStatusLabel(item.status)}</span> · Created <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time></p>
          <p>{countLabel(item.expense_count, 'expense')} · {item.confirmed_transaction_count} of {countLabel(item.transaction_count, 'payment')} confirmed</p>
          {item.transaction_count > 0 ? <>
            <Button variant="secondary" aria-expanded={selected === item.id} onClick={() => setSelected(selected === item.id ? null : item.id)}>{selected === item.id ? 'Hide' : 'Show'} payments for settlement #{item.sequence_number}</Button>
            {selected === item.id && <div className="stack"><div className="popover-heading"><strong>Payment records</strong><Button variant="secondary" aria-label="Close payment records" onClick={() => setSelected(null)}>×</Button></div><PaymentEvents key={item.id} groupId={groupId} settlementId={item.id} currentState /></div>}
          </> : <p>No payments needed.</p>}
        </div></li>)}</ul>
        <Pagination data={settlements.data} page={settlementPage} onPage={(page) => { setSelected(null); setSettlementPage(page); }} />
      </ResourceState>
    </section>
    </div>
  </>;
}

export default function GroupHistoryPage() {
  const { groupId } = useParams();
  const group = useGroupResource((signal) => getGroup(groupId, signal), [groupId]);
  return <div className="stack"><Link to={`/groups/${groupId}`}>Back to group</Link><h1>Group history</h1>
    <ResourceState resource={group}>{group.data?.group && <><h2>{group.data.group.name}</h2><History key={groupId} groupId={groupId} /></>}</ResourceState>
  </div>;
}
