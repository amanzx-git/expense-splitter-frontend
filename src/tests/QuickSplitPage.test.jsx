import { selectOption } from './selectOption.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickSplitPage from '../pages/QuickSplitPage.jsx';

const fixtureRows = new Map();
afterEach(() => { vi.unstubAllGlobals(); fixtureRows.clear(); });

// ---------- helpers ----------
const dialog = () => [...document.querySelectorAll('dialog')].at(-1);
const expenseList = () => screen.getByRole('list', { name: 'Expenses' });
const peopleList = () => screen.getByRole('list', { name: 'People' });
const itemFor = (label) => expenseList().querySelector(`[data-expense-id="${fixtureRows.get(label)}"]`);

async function addPerson(user, name) {
  if (!screen.queryByLabelText('Person name')) await user.click(screen.getByRole('button', { name: /1 · People/ }));
  await user.type(screen.getByLabelText('Person name'), name);
  await user.click(screen.getByRole('button', { name: 'Add person' }));
}
async function addPeople(user, names) {
  for (const n of names) await addPerson(user, n);
}
// splitWith: names to KEEP ticked. Omit it to keep everyone ticked.
async function addExpense(user, { description, amount, payer, splitWith }) {
  if (!document.querySelector('[data-step="expenses"]')) await user.click(screen.getByRole('button', { name: /2 .* Expenses/ }));
  const entry = within(screen.getByRole('form', { name: 'Add expense' }));
  if (amount) await user.type(entry.getByRole('textbox', { name: 'Amount' }), amount);
  if (payer) await selectOption(entry.getByRole('combobox', { name: 'Paid by' }), payer);
  if (entry.getByRole('button', { name: 'Add expense' }).disabled) return;
  await user.click(entry.getByRole('button', { name: 'Add expense' }));
  const rows = within(expenseList()).getAllByRole('listitem');
  const row = within(rows.at(-1));
  fixtureRows.set(description, rows.at(-1).dataset.expenseId);
  await user.click(row.getByText(/Split between (everyone|[0-9]+ people)/));
  if (splitWith) {
    for (const box of row.getAllByRole('checkbox')) {
      const name = box.closest('label').textContent.trim();
      if (!splitWith.includes(name)) await user.click(box);
    }
  }
}

// ---------- participants ----------
describe('participants', () => {
  it('adds people with Enter and progressively reveals expenses without resetting names', async () => {
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    expect(screen.getByRole('heading', { name: "Who's splitting?" })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Expenses' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Person name'), 'Aman{Enter}');
    await user.type(screen.getByLabelText('Person name'), 'Rahul{Enter}');
    expect(within(peopleList()).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('heading', { name: 'Expenses' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next: Expenses' }));
    expect(screen.queryByLabelText('Person name')).not.toBeInTheDocument();
    await addExpense(user, { description: 'First', amount: '10', payer: 'Aman' });
    const sharing = document.querySelector('.quick-expense-options');
    expect(sharing.open).toBe(true);
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeChecked();
  });
  it('rejects an empty name', async () => {
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    await user.click(screen.getByRole('button', { name: 'Add person' }));
    expect(screen.getByText(/enter a name/i)).toBeInTheDocument();
    expect(screen.getByText('No people yet.')).toBeInTheDocument();
  });

  it('rejects duplicate names, ignoring case', async () => {
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    await addPeople(user, ['Aman', 'aman']);
    expect(screen.getByText(/already added/i)).toBeInTheDocument();
    expect(within(peopleList()).getAllByRole('listitem')).toHaveLength(1);
  });

  it('renames without confirmation and keeps expenses attached', async () => {
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    await addPeople(user, ['Aman', 'Rahul']);
    await addExpense(user, { description: 'Dinner', amount: '900', payer: 'Aman' });
    await user.click(screen.getByRole('button', { name: /1 · People/ }));
    await user.click(screen.getByRole('button', { name: 'Rename Aman' }));
    const input = screen.getByLabelText('New name for Aman');
    await user.clear(input);
    await user.type(input, 'Amit');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(within(peopleList()).getByText('Amit')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /2 · Expenses/ }));
    expect(itemFor('Dinner')).toHaveTextContent('Amit');
    expect(dialog()).not.toHaveAttribute('open'); // no confirmation was shown
  });

  it('removes someone nobody depends on immediately', async () => {
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    await addPeople(user, ['Aman', 'Rahul']);
    await user.click(screen.getByRole('button', { name: 'Remove Rahul' }));
    expect(dialog()).not.toHaveAttribute('open');
    expect(within(peopleList()).queryByText('Rahul')).not.toBeInTheDocument();
  });
});

// ---------- expenses ----------
describe('expenses', () => {
  it.each([
    ['120.555', /at most two decimal places/i],
    ['-5', /greater than zero/i],
    ['0', /greater than zero/i],
    ['1e5', /plain number/i],
    ['abc', /plain number/i],
  ])('rejects the amount "%s"', async (amount, message) => {
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    await addPeople(user, ['Aman', 'Rahul']);
    await addExpense(user, { description: 'Dinner', amount, payer: 'Aman' });
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calculate split' })).toBeDisabled();
  });

  it('requires a payer', async () => {
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    await addPeople(user, ['Aman', 'Rahul']);
    await addExpense(user, { description: 'Dinner', amount: '100' }); // no payer chosen
    expect(screen.getByText(/choose who paid/i)).toBeInTheDocument();
  });

  it('requires at least one person in the split', async () => {
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    await addPeople(user, ['Aman', 'Rahul']);
    await addExpense(user, { description: 'Dinner', amount: '100', payer: 'Aman', splitWith: [] });
    expect(screen.getByText(/select at least one person/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calculate split' })).toBeDisabled();
  });

  it('creates an expense, split among everyone by default', async () => {
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    await addPeople(user, ['Aman', 'Rahul']);
    await addExpense(user, { description: 'Dinner', amount: '900', payer: 'Aman' });
    expect(itemFor('Dinner')).toHaveTextContent('\u20b9900.00');
    expect(itemFor('Dinner')).toHaveTextContent('Aman');
    expect(itemFor('Dinner')).toHaveTextContent('Split between everyone');
  });

  it('shows read-only payer identity and amount without name/date inputs', async () => {
    const user = userEvent.setup(); render(<QuickSplitPage />);
    await addPeople(user, ['Aman', 'Rahul']);
    await addExpense(user, { description: 'Dinner', amount: '900', payer: 'Aman' });
    const row = within(itemFor('Dinner'));
    expect(row.getByText('Aman', { selector: '.quick-expense-payer' })).toBeInTheDocument();
    expect(row.getByText('\u20b9900.00')).toBeInTheDocument();
    expect(row.queryByRole('combobox')).not.toBeInTheDocument();
    expect(row.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Expense name/)).not.toBeInTheDocument();
    expect(document.querySelector('input[type="date"]')).toBeNull();
  });
  it('retains the payer, clears only amount and refocuses the entry after adding', async () => {
    const user = userEvent.setup(); render(<QuickSplitPage />);
    await addPeople(user, ['Aman', 'Rahul']);
    await addExpense(user, { description: 'Dinner', amount: '900', payer: 'Rahul' });
    const entry = within(screen.getByRole('form', { name: 'Add expense' }));
    expect(entry.getByRole('combobox')).toHaveTextContent('Rahul');
    expect(entry.getByRole('textbox')).toHaveValue('');
    await user.type(entry.getByRole('textbox'), '1');
    await user.click(entry.getByRole('button', { name: 'Add expense' }));
    expect(entry.getByRole('textbox')).toHaveFocus();
    await user.type(entry.getByRole('textbox'), '50');
    await user.click(entry.getByRole('button', { name: 'Add expense' }));
    const row = within(document.querySelectorAll('[data-expense-id]')[2]);
    await user.click(row.getByText(/Split between everyone/));
    expect(row.getByText('Rahul', { selector: '.quick-expense-payer' })).toBeInTheDocument();
    expect(row.getAllByRole('checkbox').every((box) => box.checked)).toBe(true);
  });
  it('recalculates live when split participants change while preserving the payer', async () => {
    const user = userEvent.setup(); render(<QuickSplitPage />);
    await addPeople(user, ['Aman', 'Rahul', 'Priya']);
    await addExpense(user, { description: 'Dinner', amount: '90', payer: 'Aman' });
    const row = within(itemFor('Dinner'));
    await user.click(row.getByRole('checkbox', { name: 'Rahul' }));
    const preview = screen.getByRole('region', { name: 'Live split' });
    expect(preview).toHaveTextContent('Priya pays Aman \u20b945.00');
    expect(row.getByText('Aman', { selector: '.quick-expense-payer' })).toBeInTheDocument();
    expect(row.getByRole('checkbox', { name: 'Rahul' })).not.toBeChecked();
    expect(screen.queryByLabelText('Description')).not.toBeInTheDocument();
  });
  it('deletes only after confirmation; cancelling keeps it', async () => {
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    await addPeople(user, ['Aman', 'Rahul']);
    await addExpense(user, { description: 'Dinner', amount: '900', payer: 'Aman' });

    await user.click(within(itemFor('Dinner')).getByRole('button', { name: /Delete expense/ }));
    expect(dialog()).toHaveAttribute('open');
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(dialog()).not.toHaveAttribute('open');
    expect(itemFor('Dinner')).toBeInTheDocument();

    await user.click(within(itemFor('Dinner')).getByRole('button', { name: /Delete expense/ }));
    await user.click(within(dialog()).getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('No expenses yet.')).toBeInTheDocument();
  });
});

// ---------- removing a referenced participant ----------
describe('removing a participant who is referenced', () => {
  async function setUpScenario(user) {
    await addPeople(user, ['Aman', 'Rahul', 'Priya']);
    await addExpense(user, { description: 'Dinner', amount: '900', payer: 'Aman' }); // all three -> changed
    await addExpense(user, { description: 'Snack', amount: '60', payer: 'Aman', splitWith: ['Priya'] }); // only Priya -> deleted
    await addExpense(user, { description: 'Taxi', amount: '300', payer: 'Priya' }); // Priya paid -> deleted
    await addExpense(user, { description: 'Coffee', amount: '50', payer: 'Rahul', splitWith: ['Aman', 'Rahul'] }); // unrelated
  }

  it('shows the consequences first, and cancelling changes nothing', async () => {
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    await setUpScenario(user);
    await user.click(screen.getByRole('button', { name: /1 · People/ }));
    await user.click(screen.getByRole('button', { name: 'Remove Priya' }));
    expect(dialog()).toHaveAttribute('open');
    const d = within(dialog());
    expect(d.getByRole('heading', { name: 'Remove Priya?' })).toBeInTheDocument();

    const deleted = d.getByRole('list', { name: 'Expenses that will be deleted' });
    expect(within(deleted).getByText('Aman paid \u20b960.00')).toBeInTheDocument();
    expect(within(deleted).getByText('Priya paid \u20b9300.00')).toBeInTheDocument();
    const changed = d.getByRole('list', { name: 'Expenses that will lose Priya from the split' });
    expect(within(changed).getByText('Aman paid \u20b9900.00')).toBeInTheDocument();
    expect(d.queryByText('Rahul paid \u20b950.00')).not.toBeInTheDocument(); // unrelated: not mentioned

    await user.click(d.getByRole('button', { name: 'Cancel' }));
    expect(dialog()).not.toHaveAttribute('open');

    expect(within(peopleList()).getByText('Priya')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /2 · Expenses/ }));
    for (const name of ['Dinner', 'Snack', 'Taxi', 'Coffee']) {
      expect(itemFor(name)).toBeInTheDocument();
    }
    expect(itemFor('Dinner')).toHaveTextContent('Split between everyone');
  });

  it('on confirm: deletes, trims splits and preserves unrelated expenses', async () => {
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    await setUpScenario(user);
    await user.click(screen.getByRole('button', { name: /1 · People/ }));
    await user.click(screen.getByRole('button', { name: 'Remove Priya' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Remove' }));

    expect(within(peopleList()).queryByText('Priya')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /2 · Expenses/ }));
    expect(within(expenseList()).queryByDisplayValue('Snack')).not.toBeInTheDocument();
    expect(within(expenseList()).queryByDisplayValue('Taxi')).not.toBeInTheDocument();
    expect(itemFor('Dinner')).toHaveTextContent('Split between everyone');
    expect(itemFor('Dinner')).not.toHaveTextContent('Priya');
    expect(itemFor('Coffee')).toHaveTextContent('Rahul');
  });

  it('cancels an edit in progress, so nothing is silently lost afterwards', async () => {
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    await setUpScenario(user);
    await user.click(screen.getByRole('button', { name: /1 · People/ }));
    await user.click(screen.getByRole('button', { name: 'Remove Priya' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: /2 · Expenses/ }));
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeInTheDocument();

    await addExpense(user, { description: 'Tea', amount: '20', payer: 'Aman' });
    expect(itemFor('Tea')).toBeInTheDocument(); // the bug this guards against: it vanished
  });
});

// ---------- calculating ----------
describe('calculating', () => {
  it('is disabled until there are 2 people and 1 expense', async () => {
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    expect(screen.getByRole('button', { name: 'Next: Expenses' })).toBeDisabled();
    await addPeople(user, ['Aman', 'Rahul']);
    await user.click(screen.getByRole('button', { name: 'Next: Expenses' }));
    const calc = screen.getByRole('button', { name: 'Calculate split' });
    expect(calc).toBeDisabled();
    await addExpense(user, { description: 'Dinner', amount: '100', payer: 'Aman' });
    expect(calc).toBeEnabled();
  });

  it('gives the extra paisa to the lowest UUID and settles in a fixed order', async () => {
    let n = 0; // predictable IDs: Aman < Rahul < Priya
    vi.stubGlobal('crypto', {
      randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    });
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    await addPeople(user, ['Aman', 'Rahul', 'Priya']);
    await addExpense(user, { description: 'Dinner', amount: '100', payer: 'Aman' });
    await user.click(screen.getByRole('button', { name: 'Calculate split' }));

    const aman = screen.getByRole('row', { name: /^Aman/ });
    expect(aman).toHaveTextContent('₹100'); // paid
    expect(aman).toHaveTextContent('₹33'); // owes: the extra paisa
    expect(aman).toHaveTextContent('₹67'); // net
    expect(screen.getByRole('row', { name: /^Rahul/ })).toHaveTextContent('₹33');
    expect(screen.getByRole('row', { name: /^Priya/ })).toHaveTextContent('₹33');

    // Equal debts: the lower UUID (Rahul) is matched first.
    const transfers = within(screen.getByText('How to settle up').parentElement).getAllByRole('listitem');
    expect(transfers).toHaveLength(2);
    expect(transfers[0]).toHaveTextContent('Rahul will pay Aman ₹33');
    expect(transfers[1]).toHaveTextContent('Priya will pay Aman ₹33');
  });

   it('matches the canonical worked example', async () => {
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    await addPeople(user, ['Aman', 'Rahul', 'Priya']);
    await addExpense(user, { description: 'Dinner', amount: '900', payer: 'Aman' });
    await addExpense(user, { description: 'Taxi', amount: '300', payer: 'Rahul', splitWith: ['Rahul', 'Priya'] });
    await user.click(screen.getByRole('button', { name: 'Calculate split' }));

    // Scope to the Results section so the "See an example" text can't match.
    const results = within(screen.getByRole('region', { name: 'Results' }));
    expect(results.getByText(/Rahul will pay Aman/)).toHaveTextContent('Rahul will pay Aman ₹150');
    expect(results.getByText(/Priya will pay Aman/)).toHaveTextContent('Priya will pay Aman ₹450');
  });

  it('clears a stale result when anything changes', async () => {
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    await addPeople(user, ['Aman', 'Rahul']);
    await addExpense(user, { description: 'Dinner', amount: '100', payer: 'Aman' });
    await user.click(screen.getByRole('button', { name: 'Calculate split' }));
    expect(screen.getByRole('heading', { name: 'Results' })).toBeInTheDocument();
    await addPerson(user, 'Priya');
    expect(screen.queryByRole('heading', { name: 'Results' })).not.toBeInTheDocument();
  });
});

// ---------- local only ----------
describe('Quick Split stays local', () => {
  it('makes no network calls and writes nothing to browser storage', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    await addPeople(user, ['Aman', 'Rahul']);
    await addExpense(user, { description: 'Dinner', amount: '100', payer: 'Aman' });
    await user.click(screen.getByRole('button', { name: 'Calculate split' }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
