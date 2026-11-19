import { useEffect, useRef, useState } from 'react';
import { useInRouterContext, useSearchParams } from 'react-router-dom';
import Button from '../components/Button.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ParticipantEditor from '../features/quickSplit/ParticipantEditor.jsx';
import QuickSplitForm from '../features/quickSplit/QuickSplitForm.jsx';
import Modal from '../components/Modal.jsx';
import ExpenseList from '../features/quickSplit/ExpenseList.jsx';
import QuickSplitResults from '../features/quickSplit/QuickSplitResults.jsx';
import { calculate } from '../features/quickSplit/calculator.js';
import { validateExpenseInput } from '../utils/validation.js';
import { formatPaise } from '../utils/currency.js';
import Money from '../components/Money.jsx';
import { applyRemoval } from '../features/quickSplit/removal.js';
import { canGenerateIds, generateId } from '../utils/uuid.js';

// Everything lives in React state only. No API, no storage. Refresh erases it.
function QuickSplitCalculator({ requestedStep, onStep }) {
  const [localStep, setLocalStep] = useState('people');
  const [participants, setParticipants] = useState([]); // [{id,name}]
  // Description is an internal validation label only; the UI uses payer/amount.
  const [expenses, setExpenses] = useState([]); // [{id,description,amountText,amountPaise,payerId,participantIds}]
  const [draftPayer, setDraftPayer] = useState('');
  const [draftAmount, setDraftAmount] = useState('');
  const [draftPrompt, setDraftPrompt] = useState(false);
  const entryAmount = useRef(null);
  const adding = useRef(false);
  const [confirm, setConfirm] = useState(null); // {title,message,details,confirmLabel,onConfirm}
  const [personDraft, setPersonDraft] = useState('');
  const stepHeading = useRef(null);
  const resultsHeadingRef = useRef(null);

  const nameOf = (id) => participants.find((p) => p.id === id)?.name ?? 'Unknown';
  const canAddExpenses = participants.length >= 2;
  const checked = expenses.map((expense) => validateExpenseInput({ ...expense, validIds: participants.map((p) => p.id) }));
  const canCalculate = canAddExpenses && expenses.length > 0 && checked.every((item) => item.value);
  const liveResult = canCalculate ? calculate(participants, checked.map((item, index) => ({ ...expenses[index], ...item.value }))) : null;
  const totalPaise = expenses.reduce((sum, expense) => sum + expense.amountPaise, 0);
  const draftCheck = validateExpenseInput({ description: 'Expense', amountText: draftAmount, payerId: draftPayer, participantIds: participants.map((person) => person.id), validIds: participants.map((person) => person.id) });
  const hasDraft = draftAmount.length > 0;
  const canAddDraftForResults = !!draftCheck.value && checked.every((item) => item.value);
  const requested = requestedStep || localStep;
  const step = requested === 'expenses' && canAddExpenses || requested === 'results' && canAddExpenses && (!canCalculate || hasDraft) ? 'expenses' : requested === 'results' && canCalculate ? 'results' : 'people';
  function go(next) {
    if (onStep) onStep(next); else setLocalStep(next);
  }
  function navigate(next) {
    if (next === 'expenses' && !canAddExpenses || next === 'results' && !canCalculate && !canAddDraftForResults) return;
    if (next === 'results' && hasDraft) { setDraftPrompt(true); return; }
    go(next);
  }

  useEffect(() => {
    if (step === 'results') resultsHeadingRef.current?.focus();
    else stepHeading.current?.focus();
  }, [step]);

  // Results derive directly from validated rows; invalid edits cannot show stale totals.
  function addParticipant(name) {
    setParticipants((prev) => [...prev, { id: generateId(), name }]); // stable ID
  }
  function renameParticipant(id, name) {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  }
  function removeParticipant(id) {
    setExpenses((prev) => applyRemoval(id, prev));
    setParticipants((prev) => prev.filter((p) => p.id !== id));
    if (draftPayer === id) setDraftPayer('');
  }
  function addExpense() {
    if (adding.current || !draftCheck.value) return false;
    adding.current = true;
    const id = generateId();
    setExpenses((items) => [...items, { id, ...draftCheck.value, amountText: formatPaise(draftCheck.value.amountPaise) }]);
    setDraftAmount('');
    entryAmount.current?.focus();
    // Restore after the button becomes disabled, including a rapid second click.
    requestAnimationFrame(() => entryAmount.current?.focus());
    return true;
  }
  function changeDraftAmount(value) { adding.current = false; setDraftAmount(value); }
  function updateExpense(id, patch) {
    // Added payers/amounts stay fixed; only the share selection is editable.
    setExpenses((items) => items.map((item) => item.id === id
      ? { ...item, participantIds: patch.participantIds } : item));
  }
  function expenseLabel(expense) {
    const valid = validateExpenseInput({ ...expense, validIds: participants.map((person) => person.id) }).value;
    return valid ? `${nameOf(expense.payerId)} paid \u20b9${formatPaise(valid.amountPaise)}` : `${participants.find((person) => person.id === expense.payerId)?.name || 'Unassigned payer'}: incomplete expense`;
  }
  function requestDeleteExpense(expense) {
    setConfirm({
      title: 'Delete this expense?',
      message: `"${expenseLabel(expense)}" will be removed.`,
      confirmLabel: 'Delete',
      onConfirm: () => {
        setExpenses((prev) => prev.filter((e) => e.id !== expense.id));
      },
    });
  }
  function requestClearAll() {
    setConfirm({
      title: 'Clear everything?',
      message: 'This will remove everyone and all expenses. You cannot undo it.',
      confirmLabel: 'Clear all',
      onConfirm: () => {
        setParticipants([]);
        setExpenses([]);
        setPersonDraft('');
        setDraftPayer(''); setDraftAmount(''); adding.current = false;
        navigate('people');
      },
    });
  }

  return (
    <div className="stack quick-split-page">
      <div className="page-heading"><div><p className="eyebrow">A fair split, in a few moments</p><h1>Quick Split</h1>
      <p className="muted" role="note">
        Split expenses without signing in. Refreshing clears your split.
      </p>
      </div></div>
      <ol className="split-progress plain-list" aria-label="Quick Split steps">
        <li aria-current={step === 'people' ? 'step' : undefined}><button onClick={() => navigate('people')}>1 · People</button></li>
        <li aria-current={step === 'expenses' ? 'step' : undefined}><button disabled={!canAddExpenses} onClick={() => navigate('expenses')}>2 · Expenses</button></li>
        <li aria-current={step === 'results' ? 'step' : undefined}><button disabled={!canCalculate && !canAddDraftForResults} onClick={() => { navigate('results'); }}>3 · Results</button></li>
      </ol>
      {step === 'people' && <section className="card stack" aria-labelledby="qs-people-h" data-step="people">
        <div className="section-heading"><h2 id="qs-people-h" ref={stepHeading} tabIndex={-1}>Who's splitting?</h2><span className="muted">{participants.length} / 20 people</span></div>
        <ParticipantEditor
          participants={participants}
          expenses={expenses.map((expense) => ({ ...expense, description: expenseLabel(expense) }))}
          onAdd={addParticipant}
          onRename={renameParticipant}
          onRemove={removeParticipant}
          askConfirm={setConfirm}
          nameDraft={personDraft}
          onNameDraft={setPersonDraft}
        />
        <Button disabled={!canAddExpenses} onClick={() => navigate('expenses')}>Next</Button>
      </section>}

      {step === 'expenses' && <section className="card stack" aria-labelledby="qs-exp-h" data-step="expenses">
        <h2 id="qs-exp-h" ref={stepHeading} tabIndex={-1}>Expenses</h2>
        <QuickSplitForm participants={participants} payerId={draftPayer} amountText={draftAmount} onPayer={setDraftPayer} onAmount={changeDraftAmount} amountRef={entryAmount} valid={!!draftCheck.value} errors={draftCheck.errors} onSubmit={addExpense} />
        <ExpenseList expenses={expenses} participants={participants} errors={checked.map((item) => item.errors)} onUpdate={updateExpense} onDelete={requestDeleteExpense} />
        <section className="quick-live-summary" aria-label="Live split" aria-live="polite">
          <p className="quick-expense-total">Total: <Money value={formatPaise(totalPaise)} /></p>
          {liveResult ? <><ul className="plain-list">{liveResult.transfers.map((item) => <li key={`${item.fromId}:${item.toId}`}>{nameOf(item.fromId)} pays {nameOf(item.toId)} <Money value={formatPaise(item.paise)} /></li>)}</ul>{liveResult.transfers.length === 0 && <p>No payments are needed.</p>}</> : expenses.length > 0 && <p>Complete each expense to see the split.</p>}
        </section>
        <div className="row split-actions"><Button variant="secondary" onClick={() => navigate('people')}>Edit people</Button>
          <Button onClick={() => { navigate('results'); }} disabled={!canCalculate && !canAddDraftForResults}>Calculate split</Button>
        </div>
      </section>}
      {step === 'results' && <div className="stack" data-step="results">
        <QuickSplitResults result={liveResult} headingRef={resultsHeadingRef} />
        <div className="row"><Button onClick={() => navigate('expenses')}>Edit expenses</Button></div>
      </div>}
      <div className="row split-actions">
        <Button
          variant="secondary"
          onClick={requestClearAll}
          disabled={participants.length === 0 && expenses.length === 0}
        >
          Clear all
        </Button>
      </div>


      <Modal open={draftPrompt} title="Add this expense before results?" onClose={() => setDraftPrompt(false)}>
        <p>Add this expense or discard it to see results.</p>
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setDraftPrompt(false)}>Keep editing</Button>
          <Button variant="secondary" disabled={!canCalculate} onClick={() => { setDraftAmount(''); setDraftPrompt(false); go('results'); }}>Discard and continue</Button>
          <Button disabled={!canAddDraftForResults} onClick={() => { if (addExpense()) { setDraftPrompt(false); go('results'); } }}>Add and continue</Button>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title}
        message={confirm?.message}
        details={confirm?.details}
        confirmLabel={confirm?.confirmLabel}
        onConfirm={() => { confirm.onConfirm(); setConfirm(null); }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function UnsupportedEnvironment() {
  return (
    <div className="stack">
      <h1>Quick Split</h1>
      <div className="error-box" role="alert">
        <p><strong>This browser can’t run Quick Split safely.</strong></p>
        <p>
          Update your browser or try another one.
        </p>
      </div>
    </div>
  );
}

// A wrapper (not an early return inside the calculator) keeps React's hook order stable.
export default function QuickSplitPage() {
  const routed = useInRouterContext();
  if (!canGenerateIds()) return <UnsupportedEnvironment />;
  return routed ? <RoutedCalculator /> : <QuickSplitCalculator />;
}

function RoutedCalculator() {
  const [params, setParams] = useSearchParams();
  return <QuickSplitCalculator requestedStep={params.get('step') || 'people'} onStep={(step) => {
    const next = new URLSearchParams(params); next.set('step', step); setParams(next);
  }} />;
}
