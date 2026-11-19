import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickSplitPage from '../pages/QuickSplitPage.jsx';
import { selectOption } from './selectOption.js';

afterEach(cleanup);
async function start() {
  const user = userEvent.setup(); render(<QuickSplitPage />);
  await user.type(screen.getByLabelText('Person name'), 'Aman{Enter}Rahul{Enter}');
  await user.click(screen.getByRole('button', { name: 'Next', exact: true }));
  const entry = within(screen.getByRole('form', { name: 'Add expense' }));
  await selectOption(entry.getByRole('combobox'), 'Aman');
  return { user, entry };
}
async function add(user, entry, amount) {
  await user.type(entry.getByRole('textbox'), amount);
  await user.click(entry.getByRole('button', { name: 'Add expense' }));
}
it('keeps step navigation focused and preserves people, expenses and draft values', async () => {
  const { user, entry } = await start();
  await add(user, entry, '100');
  const expenseId = document.querySelector('[data-expense-id]').dataset.expenseId;
  await user.click(screen.getByRole('button', { name: 'Calculate split' }));
  expect(screen.getByRole('button', { name: 'Edit expenses', exact: true })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Edit people', exact: true })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Edit expenses', exact: true }));
  expect(document.querySelector('[data-expense-id]').dataset.expenseId).toBe(expenseId);
  const restored = within(screen.getByRole('form', { name: 'Add expense' }));
  await user.type(restored.getByRole('textbox'), '25');
  await user.click(screen.getByRole('button', { name: 'Edit people', exact: true }));
  expect(screen.getByText('Aman')).toBeInTheDocument();
  expect(screen.getByText('Rahul')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Next', exact: true }));
  expect(within(screen.getByRole('form', { name: 'Add expense' })).getByRole('textbox')).toHaveValue('25');
  expect(document.querySelector('[data-expense-id]').dataset.expenseId).toBe(expenseId);
});
it('adds independent entries, retains payer and focus, and prevents duplicate submissions', async () => {
  const { user, entry } = await start();
  expect(entry.getByRole('button')).toBeDisabled();
  await user.type(entry.getByRole('textbox'), '200');
  await user.dblClick(entry.getByRole('button', { name: 'Add expense' }));
  expect(screen.getAllByRole('listitem').filter((node) => node.dataset.expenseId)).toHaveLength(1);
  expect(entry.getByRole('textbox')).toHaveValue('');
  await waitFor(() => expect(entry.getByRole('textbox')).toHaveFocus());
  expect(entry.getByRole('combobox')).toHaveTextContent('Aman');
  await add(user, entry, '500');
  await selectOption(entry.getByRole('combobox'), 'Rahul');
  await add(user, entry, '150');
  const rows = document.querySelectorAll('[data-expense-id]');
  expect(new Set([...rows].map((row) => row.dataset.expenseId)).size).toBe(3);
  expect(screen.getByRole('region', { name: 'Live split' })).toHaveTextContent('Total: ₹850.00');
  await user.click(within(rows[1]).getByRole('button', { name: /Delete expense/ }));
  await user.click(within(screen.getByRole('dialog', { name: 'Delete this expense?' })).getByRole('button', { name: 'Delete' }));
  expect(screen.getByRole('region', { name: 'Live split' })).toHaveTextContent('Total: ₹350.00');
  expect(document.querySelectorAll('[data-expense-id]')).toHaveLength(2);
});
it('does not include the draft in totals and explicitly discards it before results', async () => {
  const { user, entry } = await start(); await add(user, entry, '100');
  await user.type(entry.getByRole('textbox'), '900');
  expect(screen.getByRole('region', { name: 'Live split' })).toHaveTextContent('Total: ₹100.00');
  await user.click(screen.getByRole('button', { name: 'Calculate split' }));
  const prompt = within(screen.getByRole('dialog', { name: 'Add this expense before results?' }));
  await user.click(prompt.getByRole('button', { name: 'Keep editing' }));
  expect(entry.getByRole('textbox')).toHaveValue('900');
  await user.click(screen.getByRole('button', { name: 'Calculate split' }));
  await user.click(screen.getByRole('button', { name: 'Discard and continue' }));
  expect(screen.getByRole('region', { name: 'Results' })).toHaveTextContent('Rahul will pay Aman ₹50.00');
});
it('can add the only draft and show results without a separate save step', async () => {
  const { user, entry } = await start();
  await user.type(entry.getByRole('textbox'), '100');
  await user.click(screen.getByRole('button', { name: 'Calculate split' }));
  expect(screen.getByRole('button', { name: 'Discard and continue' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Add and continue' }));
  expect(screen.getByRole('region', { name: 'Results' })).toHaveTextContent('Rahul will pay Aman ₹50.00');
});
it('keeps payer read-only and preserves selections and IDs when adding another expense', async () => {
  const { user, entry } = await start(); await add(user, entry, '100');
  const row = document.querySelector('[data-expense-id]'), id = row.dataset.expenseId;
  await user.click(within(row).getByText('Split between everyone'));
  await user.click(within(row).getByRole('checkbox', { name: 'Aman' }));
  await add(user, entry, '50');
  expect(row.dataset.expenseId).toBe(id);
  expect(within(row).getByRole('checkbox', { name: 'Aman' })).not.toBeChecked();
  expect(within(row).queryByRole('combobox')).not.toBeInTheDocument();
  expect(within(row).queryByRole('textbox')).not.toBeInTheDocument();
  expect(within(row).getByText('Aman', { selector: '.quick-expense-payer' })).toBeInTheDocument();
  expect(within(row).getByText('\u20b9100.00')).toBeInTheDocument();
  const second = document.querySelectorAll('[data-expense-id]')[1];
  expect(second.querySelector('details')).not.toHaveAttribute('open');
  await user.click(within(second).getByText('Split between everyone'));
  expect(within(second).getAllByRole('checkbox').every((box) => box.checked)).toBe(true);
});
it('preserves displayed amounts and total while an empty share selection blocks results', async () => {
  const { user, entry } = await start(); await add(user, entry, '100');
  const row = within(document.querySelector('[data-expense-id]'));
  await user.click(row.getByText('Split between everyone'));
  for (const box of row.getAllByRole('checkbox')) await user.click(box);
  expect(row.getByText('₹100.00')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Live split' })).toHaveTextContent('Total: ₹100.00');
  expect(screen.getByRole('button', { name: 'Calculate split' })).toBeDisabled();
  await user.click(row.getByRole('checkbox', { name: 'Rahul' }));
  expect(screen.getByRole('button', { name: 'Calculate split' })).toBeEnabled();
  expect(screen.getByRole('region', { name: 'Live split' })).toHaveTextContent('Rahul pays Aman ₹100.00');
});
it.each(['0', '-5', '1.234', 'abc'])('disables Add for invalid draft %s', async (value) => {
  const { user, entry } = await start();
  await user.type(entry.getByRole('textbox'), value);
  expect(entry.getByRole('button', { name: 'Add expense' })).toBeDisabled();
  expect(document.querySelectorAll('[data-expense-id]')).toHaveLength(0);
});
