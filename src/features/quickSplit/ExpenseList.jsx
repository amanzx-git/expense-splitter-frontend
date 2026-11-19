import UserAvatar from '../../components/UserAvatar.jsx';
import Money from '../../components/Money.jsx';
import { formatPaise } from '../../utils/currency.js';

function ExpenseRow({ expense, index, participants, errors, onUpdate, onDelete }) {
  const number = index + 1;
  const payer = participants.find((person) => person.id === expense.payerId);
  return <li className="quick-expense-row" data-expense-id={expense.id}>
    <div className="quick-added-expense">
      <UserAvatar user={{ full_name: payer?.name || 'Unknown' }} decorative />
      <span className="quick-expense-payer" title={payer?.name}>{payer?.name || 'Unknown'}</span>
      <Money value={formatPaise(expense.amountPaise)} />
      <button type="button" className="quick-expense-delete" aria-label={`Delete expense ${number}`} onClick={() => onDelete(expense)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 10v7m4-7v7" /></svg>
      </button>
    </div>
    <details className="quick-expense-options">
      <summary>Split between {expense.participantIds.length === participants.length ? 'everyone' : `${expense.participantIds.length} people`}</summary>
      <div className="quick-expense-controls">
        <fieldset><legend>Split between</legend>{participants.map((person) => <label className="check" key={person.id}>
          <input type="checkbox" checked={expense.participantIds.includes(person.id)} onChange={(event) => onUpdate(expense.id, { participantIds: event.target.checked ? [...expense.participantIds, person.id] : expense.participantIds.filter((id) => id !== person.id) })} />{person.name}
        </label>)}</fieldset>
      </div>
    </details>
    {errors.participants && <p className="field-error">{errors.participants}</p>}
  </li>;
}

export default function ExpenseList({ expenses, participants, errors, onUpdate, onDelete }) {
  if (!expenses.length) return <p className="muted">No expenses yet.</p>;
  return <ul className="plain-list quick-expense-list" aria-label="Expenses">{expenses.map((expense, index) => <ExpenseRow key={expense.id} expense={expense} index={index} participants={participants} errors={errors[index]} onUpdate={onUpdate} onDelete={onDelete} />)}</ul>;
}
