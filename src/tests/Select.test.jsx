import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Select from '../components/Select.jsx';

afterEach(cleanup);
function Example({ disabled = false, change = () => {} }) {
  const [value, setValue] = useState('a');
  return <><label htmlFor="choice">Expense status</label><Select id="choice" value={value} disabled={disabled} onChange={(event) => { setValue(event.target.value); change(event.target.value); }}><option value="a">All expenses</option><option value="x" disabled>Unavailable</option><option value="s">Settled</option><option value="u">Unsettled</option></Select><button>Next control</button></>;
}
it('opens a themed listbox, skips disabled options, commits Enter and restores trigger focus', async () => {
  const change = vi.fn(); render(<Example change={change} />);
  const control = screen.getByRole('combobox', { name: 'Expense status' });
  control.focus(); await userEvent.keyboard('{ArrowDown}{ArrowDown}');
  const selected = screen.getByRole('option', { name: 'All expenses' });
  expect(selected).toHaveAttribute('aria-selected', 'true');
  expect(selected.querySelector('.select-check')).toHaveTextContent('✓');
  expect(screen.getByRole('option', { name: 'Settled' })).toHaveAttribute('data-highlighted', 'true');
  await userEvent.keyboard('{Enter}');
  expect(control).toHaveTextContent('Settled'); expect(control).toHaveFocus();
  expect(change).toHaveBeenCalledExactlyOnceWith('s');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});
it('supports Escape without committing, Home/End, typeahead and Tab dismissal', async () => {
  render(<Example />); const control = screen.getByLabelText('Expense status');
  await userEvent.click(control); await userEvent.keyboard('{End}{Escape}');
  expect(control).toHaveTextContent('All expenses'); expect(control).toHaveFocus();
  await userEvent.keyboard('s{Enter}'); expect(control).toHaveTextContent('Settled');
  await userEvent.click(control); await userEvent.keyboard('{Home}{Enter}'); expect(control).toHaveTextContent('All expenses');
  await userEvent.click(control); await userEvent.tab();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next control' })).toHaveFocus();
});
it('supports touch selection and outside dismissal without selecting disabled values', async () => {
  render(<Example />); const control = screen.getByLabelText('Expense status');
  await userEvent.click(control);
  fireEvent.pointerDown(screen.getByRole('option', { name: 'Unsettled' }), { pointerType: 'touch' });
  fireEvent.click(screen.getByRole('option', { name: 'Unsettled' })); expect(control).toHaveTextContent('Unsettled');
  await userEvent.click(control); await userEvent.click(screen.getByRole('option', { name: 'Unavailable' }));
  expect(control).toHaveTextContent('Unsettled');
  fireEvent.pointerDown(document.body); expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});
it('does not open a disabled control and portals modal options inside its dialog', async () => {
  const view = render(<Example disabled />); await userEvent.click(screen.getByLabelText('Expense status'));
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument(); view.unmount();
  render(<dialog open><Example /></dialog>); await userEvent.click(screen.getByLabelText('Expense status'));
  expect(screen.getByRole('listbox').closest('dialog')).not.toBeNull();
  expect(screen.getByRole('listbox')).toHaveStyle({ position: 'fixed' });
});
