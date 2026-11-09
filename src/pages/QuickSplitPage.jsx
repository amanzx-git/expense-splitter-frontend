import { useEffect, useRef, useState } from 'react';
import Button from '../components/Button.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ParticipantEditor from '../features/quickSplit/ParticipantEditor.jsx';
import QuickSplitForm from '../features/quickSplit/QuickSplitForm.jsx';
import ExpenseList from '../features/quickSplit/ExpenseList.jsx';
import QuickSplitResults from '../features/quickSplit/QuickSplitResults.jsx';
import { calculate } from '../features/quickSplit/calculator.js';
import { applyRemoval } from '../features/quickSplit/removal.js';

// Everything lives in React state only. No API, no storage. Refresh erases it.
export default function QuickSplitPage() {
  const [participants, setParticipants] = useState([]); // [{id,name}]
  const [expenses, setExpenses] = useState([]); // [{id,description,amountPaise,payerId,participantIds,date}]
  const [result, setResult] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [confirm, setConfirm] = useState(null); // {title,message,details,confirmLabel,onConfirm}
  const resultsHeadingRef = useRef(null);

  const nameOf = (id) => participants.find((p) => p.id === id)?.name ?? 'Unknown';
  const editingExpense = expenses.find((e) => e.id === editingId) ?? null;
  const canAddExpenses = participants.length >= 2;
  const canCalculate = canAddExpenses && expenses.length > 0;

  useEffect(() => {
    if (result) resultsHeadingRef.current?.focus();
  }, [result]);

  // Any change makes an old result stale, so each handler clears it.
  function addParticipant(name) {
    setParticipants((prev) => [...prev, { id: crypto.randomUUID(), name }]); // stable ID
    setEditingId(null); // keeps an open edit form consistent with the new list
    setResult(null);
  }
  function renameParticipant(id, name) {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
    setResult(null);
  }
  function removeParticipant(id) {
    setExpenses((prev) => applyRemoval(id, prev));
    setParticipants((prev) => prev.filter((p) => p.id !== id));
    setEditingId(null); // the expense being edited may have just been deleted
    setResult(null);
  }
  function saveExpense(data) {
    if (editingId) {
      setExpenses((prev) => prev.map((e) => (e.id === editingId ? { ...e, ...data } : e)));
      setEditingId(null);
    } else {
      setExpenses((prev) => [...prev, { id: crypto.randomUUID(), ...data }]);
    }
    setResult(null);
  }
  function requestDeleteExpense(expense) {
    setConfirm({
      title: 'Delete this expense?',
      message: `"${expense.description}" will be removed.`,
      confirmLabel: 'Delete',
      onConfirm: () => {
        setExpenses((prev) => prev.filter((e) => e.id !== expense.id));
        if (editingId === expense.id) setEditingId(null);
        setResult(null);
      },
    });
  }
  function requestClearAll() {
    setConfirm({
      title: 'Clear everything?',
      message: 'All people, expenses and results will be erased. This cannot be undone.',
      confirmLabel: 'Clear all',
      onConfirm: () => {
        setParticipants([]);
        setExpenses([]);
        setResult(null);
        setEditingId(null);
      },
    });
  }

  return (
    <div className="stack">
      <h1>Quick Split</h1>
      <p className="notice" role="note">
        A temporary calculator that runs only in your browser. Nothing is saved or sent anywhere,
        and refreshing the page erases it.
      </p>
      <details>
        <summary>See an example</summary>
        <p>
          Aman paid ₹900 for dinner, split among Aman, Rahul and Priya. Rahul paid ₹300 for a taxi,
          split between Rahul and Priya. Result: Rahul pays Aman ₹150 and Priya pays Aman ₹450.
        </p>
      </details>

      <section className="card stack" aria-labelledby="qs-people-h">
        <h2 id="qs-people-h">People</h2>
        <ParticipantEditor
          participants={participants}
          expenses={expenses}
          onAdd={addParticipant}
          onRename={renameParticipant}
          onRemove={removeParticipant}
          askConfirm={setConfirm}
        />
      </section>

      <section className="card stack" aria-labelledby="qs-exp-h">
        <h2 id="qs-exp-h">Expenses</h2>
        {canAddExpenses ? (
          <QuickSplitForm
            key={editingExpense?.id ?? 'new'}
            participants={participants}
            initial={editingExpense}
            onSubmit={saveExpense}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <p className="muted">Add at least two people before adding expenses.</p>
        )}
        <ExpenseList expenses={expenses} nameOf={nameOf} onEdit={setEditingId} onDelete={requestDeleteExpense} />
      </section>

      <div className="row">
        <Button onClick={() => setResult(calculate(participants, expenses))} disabled={!canCalculate}>
          Calculate split
        </Button>
        <Button
          variant="secondary"
          onClick={requestClearAll}
          disabled={participants.length === 0 && expenses.length === 0}
        >
          Clear all
        </Button>
      </div>

      {result && <QuickSplitResults result={result} headingRef={resultsHeadingRef} />}

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