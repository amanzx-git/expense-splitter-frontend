import { useState } from 'react';
import Button from '../../components/Button.jsx';
import Input from '../../components/Input.jsx';
import { validateExpenseInput } from '../../utils/validation.js';
import { formatPaise } from '../../utils/currency.js';
import { localDateString } from '../../utils/dates.js';

// `initial` = an existing expense (edit mode) or null (add mode).
export default function QuickSplitForm({ participants, initial, onSubmit, onCancel }) {
  const editing = Boolean(initial);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amountText, setAmountText] = useState(initial ? formatPaise(initial.amountPaise) : '');
  const [payerId, setPayerId] = useState(initial?.payerId ?? '');
  const [date, setDate] = useState(initial?.date ?? localDateString());
  // We store who is EXCLUDED, so everyone (including people added later) is
  // selected by default.
  const [excluded, setExcluded] = useState(
    () => new Set(initial ? participants.filter((p) => !initial.participantIds.includes(p.id)).map((p) => p.id) : [])
  );
  const [errors, setErrors] = useState({});

  const selectedIds = participants.filter((p) => !excluded.has(p.id)).map((p) => p.id);

  function toggle(id) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    const { errors: found, value } = validateExpenseInput({
      description,
      amountText,
      payerId,
      participantIds: selectedIds,
      validIds: participants.map((p) => p.id),
    });
    setErrors(found);
    if (!value) return;
    onSubmit({ ...value, date });
    if (!editing) {
      setDescription('');
      setAmountText('');
      setExcluded(new Set());
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack" noValidate>
      <h3>{editing ? 'Edit expense' : 'Add an expense'}</h3>

      <Input label="Description" value={description} maxLength={200}
        onChange={(e) => setDescription(e.target.value)} error={errors.description} />

      <Input label="Amount (₹)" inputMode="decimal" hint="For example 120 or 120.50"
        value={amountText} onChange={(e) => setAmountText(e.target.value)} error={errors.amount} />

      <div className="field">
        <label htmlFor="qs-payer">Paid by</label>
        <select id="qs-payer" value={payerId} onChange={(e) => setPayerId(e.target.value)}
          aria-invalid={errors.payer ? 'true' : undefined}
          aria-describedby={errors.payer ? 'qs-payer-error' : undefined}>
          <option value="">Choose…</option>
          {participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {errors.payer && <span id="qs-payer-error" className="field-error">Error: {errors.payer}</span>}
      </div>

      <fieldset className="field" aria-describedby={errors.participants ? 'qs-part-error' : undefined}>
        <legend>Split between</legend>
        {participants.map((p) => (
          <label key={p.id} className="check">
            <input type="checkbox" checked={!excluded.has(p.id)} onChange={() => toggle(p.id)} />
            {p.name}
          </label>
        ))}
        {errors.participants && <span id="qs-part-error" className="field-error">Error: {errors.participants}</span>}
      </fieldset>

      <Input label="Date (optional)" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

      <div className="row">
        <Button type="submit">{editing ? 'Save changes' : 'Add expense'}</Button>
        {editing && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}