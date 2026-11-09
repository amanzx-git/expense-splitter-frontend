import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickSplitPage from '../pages/QuickSplitPage.jsx';

afterEach(() => vi.unstubAllGlobals());

// ---------- helpers ----------
const dialog = () => document.querySelector('dialog');
const expenseList = () => screen.getByRole('list', { name: 'Expenses' });
const peopleList = () => screen.getByRole('list', { name: 'People' });
const itemFor = (description) => within(expenseList()).getByText(description).closest('li');

async function addPerson(user, name) {
  await user.type(screen.getByLabelText('Person name'), name);
  await user.click(screen.getByRole('button', { name: 'Add person' }));
}
async function addPeople(user, names) {
  for (const n of names) await addPerson(user, n);
}
// splitWith: names to KEEP ticked. Omit it to keep everyone ticked.
async function addExpense(user, { description, amount, payer, splitWith }) {
  await user.type(screen.getByLabelText('Description'), description);
  await user.type(screen.getByLabelText(/amount/i), amount);
  if (payer) await user.selectOptions(screen.getByLabelText('Paid by'), payer);
  if (splitWith) {
    for (const box of screen.getAllByRole('checkbox')) {
      const name = box.closest('label').textContent.trim();
      if (!splitWith.includes(name)) await user.click(box);
    }
  }
  await user.click(screen.getByRole('button', { name: 'Add expense' }));
}

// ---------- participants ----------
describe('participants', () => {
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

    await user.click(screen.getByRole('button', { name: 'Rename Aman' }));
    const input = screen.getByLabelText('New name for Aman');
    await user.clear(input);
    await user.type(input, 'Amit');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(within(peopleList()).getByText('Amit')).toBeInTheDocument();
    expect(itemFor('Dinner')).toHaveTextContent('Paid by Amit');
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
    expect(screen.queryByRole('list', { name: 'Expenses' })).not.toBeInTheDocument();
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
    expect(screen.queryByRole('list', { name: 'Expenses' })).not.toBeInTheDocument();
  });

  it('creates an expense, split among everyone by default', async () => {
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    await addPeople(user, ['Aman', 'Rahul']);
    await addExpense(user, { description: 'Dinner', amount: '900', payer: 'Aman' });
    expect(itemFor('Dinner')).toHaveTextContent('₹900.00');
    expect(itemFor('Dinner')).toHaveTextContent('Paid by Aman · Split among Aman, Rahul');
  });

  it('edits an expense and returns to add mode', async () => {
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    await addPeople(user, ['Aman', 'Rahul']);
    await addExpense(user, { description: 'Dinner', amount: '900', payer: 'Aman' });

    await user.click(screen.getByRole('button', { name: 'Edit Dinner' }));
    expect(screen.getByRole('heading', { name: 'Edit expense' })).toBeInTheDocument();
    const description = screen.getByLabelText('Description');
    const amount = screen.getByLabelText(/amount/i);
    expect(description).toHaveValue('Dinner');
    expect(amount).toHaveValue('900.00');

    await user.clear(description);
    await user.type(description, 'Lunch');
    await user.clear(amount);
    await user.type(amount, '450.5');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(within(expenseList()).queryByText('Dinner')).not.toBeInTheDocument();
    expect(itemFor('Lunch')).toHaveTextContent('₹450.50');
    expect(screen.getByRole('heading', { name: 'Add an expense' })).toBeInTheDocument();
  });

  it('cancelling an edit changes nothing', async () => {
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    await addPeople(user, ['Aman', 'Rahul']);
    await addExpense(user, { description: 'Dinner', amount: '900', payer: 'Aman' });
    await user.click(screen.getByRole('button', { name: 'Edit Dinner' }));
    await user.type(screen.getByLabelText('Description'), ' (edited)');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(itemFor('Dinner')).toHaveTextContent('₹900.00');
    expect(screen.getByRole('heading', { name: 'Add an expense' })).toBeInTheDocument();
  });

  it('deletes only after confirmation; cancelling keeps it', async () => {
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    await addPeople(user, ['Aman', 'Rahul']);
    await addExpense(user, { description: 'Dinner', amount: '900', payer: 'Aman' });

    await user.click(screen.getByRole('button', { name: 'Delete Dinner' }));
    expect(dialog()).toHaveAttribute('open');
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(dialog()).not.toHaveAttribute('open');
    expect(itemFor('Dinner')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete Dinner' }));
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

    await user.click(screen.getByRole('button', { name: 'Remove Priya' }));
    expect(dialog()).toHaveAttribute('open');
    const d = within(dialog());
    expect(d.getByRole('heading', { name: 'Remove Priya?' })).toBeInTheDocument();

    const deleted = d.getByRole('list', { name: 'Expenses that will be deleted' });
    expect(within(deleted).getByText('Snack')).toBeInTheDocument();
    expect(within(deleted).getByText('Taxi')).toBeInTheDocument();
    const changed = d.getByRole('list', { name: 'Expenses that will lose Priya from the split' });
    expect(within(changed).getByText('Dinner')).toBeInTheDocument();
    expect(d.queryByText('Coffee')).not.toBeInTheDocument(); // unrelated: not mentioned

    await user.click(d.getByRole('button', { name: 'Cancel' }));
    expect(dialog()).not.toHaveAttribute('open');

    expect(within(peopleList()).getByText('Priya')).toBeInTheDocument();
    for (const name of ['Dinner', 'Snack', 'Taxi', 'Coffee']) {
      expect(itemFor(name)).toBeInTheDocument();
    }
    expect(itemFor('Dinner')).toHaveTextContent('Split among Aman, Rahul, Priya');
  });

  it('on confirm: deletes, trims splits and preserves unrelated expenses', async () => {
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    await setUpScenario(user);

    await user.click(screen.getByRole('button', { name: 'Remove Priya' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Remove' }));

    expect(within(peopleList()).queryByText('Priya')).not.toBeInTheDocument();
    expect(within(expenseList()).queryByText('Snack')).not.toBeInTheDocument();
    expect(within(expenseList()).queryByText('Taxi')).not.toBeInTheDocument();
    expect(itemFor('Dinner')).toHaveTextContent('Split among Aman, Rahul');
    expect(itemFor('Dinner')).not.toHaveTextContent('Priya');
    expect(itemFor('Coffee')).toHaveTextContent('Paid by Rahul · Split among Aman, Rahul');
  });

  it('cancels an edit in progress, so nothing is silently lost afterwards', async () => {
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    await setUpScenario(user);
    await user.click(screen.getByRole('button', { name: 'Edit Taxi' }));
    await user.click(screen.getByRole('button', { name: 'Remove Priya' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Remove' }));
    expect(screen.getByRole('heading', { name: 'Add an expense' })).toBeInTheDocument();

    await addExpense(user, { description: 'Tea', amount: '20', payer: 'Aman' });
    expect(itemFor('Tea')).toBeInTheDocument(); // the bug this guards against: it vanished
  });
});

// ---------- calculating ----------
describe('calculating', () => {
  it('is disabled until there are 2 people and 1 expense', async () => {
    const user = userEvent.setup();
    render(<QuickSplitPage />);
    const calc = screen.getByRole('button', { name: 'Calculate split' });
    expect(calc).toBeDisabled();
    await addPeople(user, ['Aman', 'Rahul']);
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
    expect(aman).toHaveTextContent('₹100.00'); // paid
    expect(aman).toHaveTextContent('₹33.34'); // owes: the extra paisa
    expect(aman).toHaveTextContent('₹66.66'); // net
    expect(screen.getByRole('row', { name: /^Rahul/ })).toHaveTextContent('₹33.33');
    expect(screen.getByRole('row', { name: /^Priya/ })).toHaveTextContent('₹33.33');

    // Equal debts: the lower UUID (Rahul) is matched first.
    const transfers = within(screen.getByText('How to settle up').parentElement).getAllByRole('listitem');
    expect(transfers).toHaveLength(2);
    expect(transfers[0]).toHaveTextContent('Rahul pays Aman ₹33.33');
    expect(transfers[1]).toHaveTextContent('Priya pays Aman ₹33.33');
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
    expect(results.getByText(/Rahul pays Aman/)).toHaveTextContent('Rahul pays Aman ₹150.00');
    expect(results.getByText(/Priya pays Aman/)).toHaveTextContent('Priya pays Aman ₹450.00');
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