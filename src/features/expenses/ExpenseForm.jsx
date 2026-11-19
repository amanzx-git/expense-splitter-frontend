import Select from '../../components/Select.jsx';
import { useEffect, useId, useState } from 'react';
import Button from '../../components/Button.jsx';
import Input from '../../components/Input.jsx';
import FormAlert from '../../components/FormAlert.jsx';
import Money from '../../components/Money.jsx';
import { validateExpenseInput } from '../../utils/validation.js';
import { parseRupeesToPaise, formatPaise } from '../../utils/currency.js';
import { localDateString } from '../../utils/dates.js';
import { splitEqually } from '../quickSplit/calculator.js';
import { describeActionError } from '../../utils/apiErrors.js';
import { useGroupResource, ResourceState } from '../groups/resources.jsx';
import * as api from '../../api/expenses.js';
import { useAuth } from '../../hooks/useAuth.js';

export default function ExpenseForm({ groupId, isAdmin = false, initial, draft, onDraft, onSaved, onCancel, onConflict, onBusy }) {
  const { user } = useAuth();
  const members = useGroupResource((signal) => api.getAllMembers(groupId, signal), [groupId]);
  const [description, setDescription] = useState(draft?.description ?? initial?.description ?? '');
  const [amount, setAmount] = useState(draft?.amount ?? initial?.amount ?? '');
  const [payer, setPayer] = useState(draft?.payer ?? initial?.paid_by.id ?? user?.id ?? '');
  const [date, setDate] = useState(draft?.date ?? initial?.expense_date ?? localDateString());
  const [excluded, setExcluded] = useState(new Set(draft?.excluded ?? []));
  const [selected, setSelected] = useState(draft?.selected ?? (initial ? initial.shares.map((s) => s.user.id) : null));
  useEffect(() => { onDraft?.({ description, amount, payer, date, excluded: [...excluded], selected }); }, [description, amount, payer, date, excluded, selected, onDraft]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const fieldId = useId();
  const people = members.data?.map((m) => m.user) ?? [];
  const ids = selected ?? people.filter((p) => !excluded.has(p.id)).map((p) => p.id);
  const parsed = parseRupeesToPaise(amount);
  function toggle(id) {
    if (selected) setSelected((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
    else setExcluded((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || members.loading || members.error) return;
    const chosenPayer = isAdmin ? payer : user?.id;
    const result = validateExpenseInput({ description, amountText: amount, payerId: chosenPayer, participantIds: ids, validIds: people.map((p) => p.id) });
    const fields = { ...result.errors, paid_by: result.errors.payer, participant_ids: result.errors.participants };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fields.expense_date = 'Enter an expense date.';
    if (ids.some((id) => !people.some((p) => p.id === id))) fields.participant_ids = 'Select only current group members.';
    setError({ fieldErrors: fields });
    if (!result.value || fields.expense_date || fields.participant_ids) return;
    setBusy(true);
    onBusy?.(true);
    try {
      const body = { description: result.value.description, amount: formatPaise(result.value.amountPaise), ...(isAdmin ? { paid_by: chosenPayer } : {}), participant_ids: ids, expense_date: date };
      const data = initial ? await api.updateExpense(initial.id, body) : await api.createExpense(groupId, body);
      onSaved(data.expense);
    } catch (err) {
      setError(describeActionError(err, initial ? 'save this expense' : 'add this expense', ['description', 'amount', 'paid_by', 'participant_ids', 'expense_date']));
      if ([403, 404, 409].includes(err.status)) onConflict?.(err);
    } finally { setBusy(false); onBusy?.(false); }
  }
  return <section className="card stack">
    <h3>{initial ? 'Edit expense' : 'Create expense'}</h3>
    <ResourceState resource={members}>
      <form onSubmit={submit} className="stack" noValidate>
        <FormAlert message={error?.message} items={error?.other} hint={error?.hint} />
        <div className="amount-field">
        <Input label="Amount (INR)" autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={error?.fieldErrors?.amount} />
        </div>
        {isAdmin && <div className="field">
          <label htmlFor={fieldId}>Paid by</label>
          <Select id={fieldId} value={payer} onChange={(e) => setPayer(e.target.value)} aria-invalid={!!error?.fieldErrors?.paid_by} aria-describedby={error?.fieldErrors?.paid_by ? fieldId+'-error' : undefined}>
            <option value="">Choose payer</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name} (@{p.username})</option>)}
          </Select>
          {error?.fieldErrors?.paid_by && <span id={fieldId+'-error'} className="field-error">{error.fieldErrors.paid_by}</span>}
        </div>}
        <fieldset className="field" aria-describedby={error?.fieldErrors?.participant_ids ? fieldId+'-participants-error' : undefined}>
          <legend>Split between</legend>
          {people.map((p) => <label className="check" key={p.id}><input type="checkbox" checked={ids.includes(p.id)} onChange={() => toggle(p.id)} />{p.full_name} (@{p.username})</label>)}
          {error?.fieldErrors?.participant_ids && <span id={fieldId+'-participants-error'} className="field-error">{error.fieldErrors.participant_ids}</span>}
        </fieldset>
        <Input label="Expense description" hint="What was this expense for?" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} error={error?.fieldErrors?.description} />
        <Input label="Expense date" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={error?.fieldErrors?.expense_date} />
        {parsed.paise && ids.length > 0 && <div><h3>Estimated shares</h3><p className="muted">Final shares are confirmed when you save.</p>
          <ul>{splitEqually(parsed.paise, ids).map((s) => <li key={s.id}>@{people.find((p) => p.id === s.id)?.username ?? 'Former member'}: <Money value={formatPaise(s.paise)} /></li>)}</ul>
        </div>}
        <div className="row"><Button type="submit" loading={busy}>{busy ? 'Saving expense…' : initial ? 'Save expense' : 'Add expense'}</Button><Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button></div>
      </form>
    </ResourceState>
  </section>;
}
