import { selectOption } from './selectOption.js';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import QuickSplitPage from '../pages/QuickSplitPage.jsx';

afterEach(cleanup);
function BrowserButtons() { const navigate = useNavigate(); return <><button onClick={() => navigate(-1)}>Browser Back</button><button onClick={() => navigate(1)}>Browser Forward</button></>; }
it('mounts exactly one step body and preserves people, saved expenses and drafts across history', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/quick-split']}><QuickSplitPage /><BrowserButtons /></MemoryRouter>);
  const oneStep = (step) => {
    expect(document.querySelectorAll('[data-step]')).toHaveLength(1);
    expect(document.querySelector('[data-step]')).toHaveAttribute('data-step', step);
  };
  oneStep('people');
  expect(document.querySelector('input[inputmode="decimal"]')).toBeNull();
  expect(screen.getByRole('button', { name: 'Next: Expenses' })).toBeDisabled();
  await user.type(screen.getByLabelText('Person name'), 'Aman{Enter}Rahul{Enter}');
  await user.click(screen.getByRole('button', { name: 'Next: Expenses' }));
  oneStep('expenses'); expect(screen.queryByLabelText('Person name')).not.toBeInTheDocument();
  expect(screen.getByRole('form', { name: 'Add expense' })).toBeInTheDocument();
  await user.type(screen.getByLabelText(/amount/i), '100.01');
  await selectOption(screen.getByRole('combobox', { name: /Paid by/ }), 'Aman');
  await user.click(screen.getByRole('button', { name: 'Browser Back' }));
  oneStep('people'); expect(screen.getByRole('list', { name: 'People' })).toHaveTextContent('Aman');
  await user.click(screen.getByRole('button', { name: 'Browser Forward' }));
  oneStep('expenses'); expect(screen.getByLabelText(/amount/i)).toHaveValue('100.01');
  expect(screen.getByRole('combobox', { name: /Paid by/ })).toHaveTextContent('Aman');
  await user.click(screen.getByRole('button', { name: 'Add expense' }));
  await user.click(screen.getByRole('button', { name: 'Calculate split' }));
  oneStep('results'); expect(screen.queryByLabelText(/amount/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('list', { name: 'Expenses' })).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Results' })).toHaveTextContent('Rahul pays Aman');
  await user.click(screen.getByRole('button', { name: 'Back: Edit expenses' }));
  oneStep('expenses'); expect(within(screen.getByRole('list', { name: 'Expenses' })).getByText('\u20b9100.01')).toBeInTheDocument();
});
it('needs only payer and amount without changing money calculations', async () => {
  const user = userEvent.setup(); render(<QuickSplitPage />);
  await user.type(screen.getByLabelText('Person name'), 'Aman{Enter}Rahul{Enter}');
  await user.click(screen.getByRole('button', { name: 'Next: Expenses' }));
  await user.type(screen.getByLabelText(/amount/i), '10');
  await selectOption(screen.getByRole('combobox', { name: /Paid by/ }), 'Aman');
  expect(screen.queryByLabelText(/Expense name/)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Add expense' }));
  await user.click(screen.getByRole('button', { name: 'Calculate split' }));
  expect(screen.getByRole('region', { name: 'Results' })).toHaveTextContent('Rahul pays Aman');
  expect(screen.getByRole('region', { name: 'Results' })).toHaveTextContent('₹5.00');
});
