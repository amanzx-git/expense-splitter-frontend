import Select from '../../components/Select.jsx';
import Button from '../../components/Button.jsx';

export default function QuickSplitForm({ participants, payerId, amountText, onPayer, onAmount, amountRef, valid, errors, onSubmit }) {
  return <form aria-label="Add expense" className="quick-entry" onPointerDownCapture={(event) => {
    // Keep the amount keyboard/focus stable even on a rapid second Add tap.
    if (event.target.closest('button[type="submit"]')) event.preventDefault();
  }} onSubmit={(event) => { event.preventDefault(); onSubmit(); }} noValidate>
    <div className="quick-expense-inputs">
      <Select aria-label="Paid by" value={payerId} onChange={(event) => onPayer(event.target.value)}>
        <option value="">Paid by</option>{participants.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
      </Select>
      <span className="quick-amount-input"><span aria-hidden="true">&#8377;</span><input ref={amountRef} aria-label="Amount" inputMode="decimal" placeholder="0.00" value={amountText} aria-invalid={amountText.length > 0 && !!errors.amount} aria-describedby={amountText.length > 0 && errors.amount ? 'quick-draft-error' : undefined} onChange={(event) => onAmount(event.target.value)} /></span>
      <Button type="submit" disabled={!valid} aria-label="Add expense">+ Add</Button>
    </div>
    {amountText.length > 0 && errors.amount && <p className="field-error" id="quick-draft-error">{errors.amount}</p>}
    {amountText.length > 0 && errors.payer && <p className="field-error">{errors.payer}</p>}
  </form>;
}
