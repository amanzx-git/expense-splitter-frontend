import { userHandle } from '../../utils/identity.js';
import Select from '../../components/Select.jsx';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as api from '../../api/expenses.js';
import { useGroupResource, ResourceState, Pagination } from '../groups/resources.jsx';
import { formatCalendarDate } from '../../utils/dates.js';
import Button from '../../components/Button.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Modal from '../../components/Modal.jsx';
import Money from '../../components/Money.jsx';
import ExpenseForm from './ExpenseForm.jsx';
import ExpenseDetail from './ExpenseDetail.jsx';
import Comments from './Comments.jsx';
import GroupBalances from '../balances/GroupBalances.jsx';
import GenerateSettlement from '../settlements/GenerateSettlement.jsx';
import SettlementHistory from '../settlements/SettlementHistory.jsx';
import UserAvatar from '../../components/UserAvatar.jsx';
import RecentActivity from '../history/RecentActivity.jsx';
import GroupFinancialActions from '../balances/GroupFinancialActions.jsx';
import { loadConversation } from '../history/conversation.js';

export default function GroupExpenses({ group, compact = false, settlementTarget }) {
  const [balanceRevision, setBalanceRevision] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('unsettled');
  const [creatingLocal, setCreatingLocal] = useState(false);
  const [createDraft, setCreateDraft] = useState(null);
  const [formBusy, setFormBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [discussionBusy, setDiscussionBusy] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const panelEntry = useRef(false);
  const panel = params.get('panel');
  const creating = compact ? panel === 'add-expense' : creatingLocal;
  const discussionOpen = compact && panel === 'discussion';
  const balancesOpen = compact && panel === 'balances';
  function showPanel(value) {
    if (value) {
      panelEntry.current = true;
      const next = new URLSearchParams(params); next.set('panel', value); setParams(next);
    } else if (panel) {
      if (panelEntry.current) { panelEntry.current = false; navigate(-1); }
      else { const next = new URLSearchParams(params); next.delete('panel'); next.delete('comment'); setParams(next, { replace: true }); }
    }
  }
  function setCreating(value) { if (compact) showPanel(value ? 'add-expense' : null); else setCreatingLocal(value); }
  const expenseId = params.get('expense');
  const opener = useRef(null);
  const heading = useRef(null);
  const list = useGroupResource((signal) => compact ? loadConversation(group.id, signal) : api.listExpenses(group.id, page, status, signal), [group.id, page, status, compact]);
  useEffect(() => {
    if (!compact) return;
    const refresh = () => list.refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [compact, group.id]);
  function refreshExpenses() {
    list.refresh();
    setBalanceRevision((revision) => revision + 1);
  }
  function open(id, target) {
    opener.current = target;
    const next = new URLSearchParams(params); next.delete('panel'); next.set('expense', id); setParams(next, { replace: !!panel });
  }
  function close() {
    if (!expenseId) return;
    const next = new URLSearchParams(params); next.delete('expense'); setParams(next, { replace: true });
    setTimeout(() => (opener.current?.isConnected ? opener.current : heading.current)?.focus(), 0);
  }
  return <div className={compact ? 'conversation-body' : 'stack'}>
    {!compact && savedMessage && <p role="status">{savedMessage}</p>}
    {!compact && <section className="card stack">
      <h2 ref={heading} tabIndex={-1}>Expenses</h2>
      <Button onClick={() => setCreating(true)} disabled={creating || formBusy}>{compact ? 'Add an expense' : 'New expense'}</Button>
      {!compact && creating && <ExpenseForm groupId={group.id} isAdmin={group.my_role === 'admin'} onCancel={() => setCreating(false)} onSaved={(expense) => { setCreating(false); refreshExpenses(); open(expense.id, heading.current); }} onConflict={refreshExpenses} />}
      {!compact && <>
      <div className="field"><label htmlFor="expense-status">Expense status</label>
        <Select id="expense-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All expenses</option><option value="unsettled">Unsettled</option><option value="settled">In a settlement</option>
        </Select>
      </div>
      <ResourceState resource={list}>
        {list.data?.results.length === 0 && <EmptyState title="No expenses yet" description="Add one to get started." />}
        <ul className="plain-list">{list.data?.results.map((expense) => <li key={expense.id} className="list-item"><div className="list-item-main">
          <Button variant="secondary" onClick={(e) => open(expense.id, e.currentTarget)}>{expense.description}</Button>
          <p className="identity"><UserAvatar user={expense.paid_by} decorative /><span><Money value={expense.amount} /> paid by {userHandle(expense.paid_by)}</span></p>
          <p><time dateTime={expense.expense_date}>{formatCalendarDate(expense.expense_date)}</time> - {expense.settlement_id ? 'In a settlement' : 'Not yet settled'}</p>
          <p className="muted">Participants: {expense.shares.map((s) => userHandle(s.user)).join(', ')}</p>
        </div></li>)}</ul>
        <Pagination data={list.data} page={page} onPage={setPage} />
      </ResourceState>
      </>}
    </section>}
    {compact ? <RecentActivity groupId={group.id} expenses={list} revision={balanceRevision} onExpense={open} conversation page={page} onPage={setPage} message={savedMessage} headingRef={heading} /> : <><GroupBalances groupId={group.id} revision={balanceRevision} isAdmin={group.my_role === 'admin'} onAdd={() => setCreating(true)}>
      {(preview) => <GenerateSettlement group={group} preview={preview} onChanged={refreshExpenses} />}
    </GroupBalances>
    <SettlementHistory groupId={group.id} revision={balanceRevision} />
    <Comments groupId={group.id} />
    </>}
    {compact && <GroupFinancialActions settlementTarget={settlementTarget} group={group} revision={balanceRevision} onChanged={refreshExpenses} onAdd={() => { setSavedMessage(''); setCreating(true); }} busy={creating || formBusy} />}
    <Modal open={balancesOpen} title="Group balances" onClose={() => { if (balancesOpen) showPanel(null); }}><GroupBalances groupId={group.id} revision={balanceRevision} inModal isAdmin={group.my_role === 'admin'} onAdd={() => {
      setSavedMessage('');
      const next = new URLSearchParams(params); next.set('panel', 'add-expense'); setParams(next, { replace: true });
    }} /></Modal>
    <Modal open={compact && creating} title="Add expense" busy={formBusy} onClose={() => { if (!formBusy) setCreating(false); }}>
      <ExpenseForm groupId={group.id} isAdmin={group.my_role === 'admin'} draft={createDraft} onDraft={setCreateDraft} onBusy={setFormBusy} onCancel={() => { setCreateDraft(null); setCreating(false); }} onSaved={() => { setCreateDraft(null); setCreating(false); setPage(1); setSavedMessage('Expense added to the group.'); refreshExpenses(); }} onConflict={refreshExpenses} />
    </Modal>
    <Modal open={discussionOpen} title="Group discussion" busy={discussionBusy} onClose={() => { if (!discussionBusy) showPanel(null); }}><Comments groupId={group.id} onBusy={setDiscussionBusy} /></Modal>
    <Modal open={!!expenseId} title="Expense details" busy={detailBusy} onClose={() => { if (!detailBusy) close(); }}>
      {expenseId && <ExpenseDetail key={expenseId} id={expenseId} group={group} onBusy={setDetailBusy} onChanged={refreshExpenses} onDeleted={() => { setSavedMessage('Expense deleted.'); close(); if (page > 1 && list.data?.results.length === 1) setPage(page - 1); refreshExpenses(); }} />}
    </Modal>
  </div>;
}
