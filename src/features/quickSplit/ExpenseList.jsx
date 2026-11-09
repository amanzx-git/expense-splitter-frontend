import Button from '../../components/Button.jsx';
import Money from '../../components/Money.jsx';
import { formatPaise } from '../../utils/currency.js';
import { formatCalendarDate } from '../../utils/dates.js';

export default function ExpenseList({ expenses, nameOf, onEdit, onDelete }) {
  if (expenses.length === 0) return <p className="muted">No expenses yet.</p>;
  return (
    <ul className="plain-list" aria-label="Expenses">
      {expenses.map((e) => (
        <li key={e.id} className="list-item">
          <div className="list-item-main">
            <strong>{e.description}</strong> <Money value={formatPaise(e.amountPaise)} />
            <div className="muted">
              Paid by {nameOf(e.payerId)} · Split among {e.participantIds.map(nameOf).join(', ')}
              {e.date ? ` · ${formatCalendarDate(e.date)}` : ''}
            </div>
          </div>
          <div className="row">
            <Button variant="secondary" onClick={() => onEdit(e.id)} aria-label={`Edit ${e.description}`}>Edit</Button>
            <Button variant="danger" onClick={() => onDelete(e)} aria-label={`Delete ${e.description}`}>Delete</Button>
          </div>
        </li>
      ))}
    </ul>
  );
}