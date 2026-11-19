import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import QuickSplitResults from '../features/quickSplit/QuickSplitResults.jsx';

afterEach(cleanup);

it('shows payment direction, neutral totals and settled balances', () => {
  render(<QuickSplitResults result={{
    people: [
      { id: 'a', name: 'Aman', paid: 10001, owed: 5000, net: 5001 },
      { id: 'b', name: 'Rahul', paid: 0, owed: 5001, net: -5001 },
      { id: 'c', name: 'Sam', paid: 1000, owed: 1000, net: 0 },
    ],
    transfers: [{ fromId: 'b', toId: 'a', paise: 5001 }],
  }} />);
  for (const name of ['Amount paid', 'Your share', 'To settle']) {
    expect(screen.getByRole('columnheader', { name })).toBeInTheDocument();
  }
  expect(screen.getAllByRole('columnheader')).toHaveLength(4);
  expect(screen.queryByRole('columnheader', { name: 'Status' })).not.toBeInTheDocument();
  const summary = screen.getByText(/Rahul will pay Aman/);
  expect(summary).toHaveTextContent('Rahul will pay Aman ₹50');
  expect(summary.querySelector('.money')).toHaveClass('payment-direction--outgoing');
  for (const [name, status, direction] of [
    ['Aman', 'Will receive', 'incoming'], ['Rahul', 'Will pay', 'outgoing'], ['Sam', 'Settled', null],
  ]) {
    const row = screen.getByRole('rowheader', { name }).closest('tr');
    const cells = within(row).getAllByRole('cell');
    expect(cells).toHaveLength(3);
    expect(cells[2].textContent.trim()).toBe(direction ? `${status} ₹50` : 'Settled');
    expect(cells[2]).toHaveClass('num');
    const amount = cells[2].querySelector('.money');
    if (direction) expect(amount).toHaveClass(`payment-direction--${direction}`);
    else expect(amount).toBeNull();
    for (const cell of cells.slice(0, 2)) expect(cell.querySelector('.money').className).toBe('money');
  }
});

it.each([[124949, '\u20b91,249'], [124950, '\u20b91,250'], [124951, '\u20b91,250'], [12345650, '\u20b91,23,457'], [1, '\u20b90']])('rounds %i paise consistently in every results amount without mutating it', (paise, display) => {
  const result = {
    people: [
      { id: 'a', name: 'Aman', paid: paise, owed: paise, net: paise },
      { id: 'b', name: 'Rahul', paid: 0, owed: paise, net: -paise },
    ],
    transfers: [{ fromId: 'b', toId: 'a', paise }],
  };
  const original = structuredClone(result);
  render(<QuickSplitResults result={result} />);
  expect(screen.getByText(/Rahul will pay Aman/)).toHaveTextContent(`Rahul will pay Aman ${display}`);
  const cells = within(screen.getByRole('rowheader', { name: 'Aman' }).closest('tr')).getAllByRole('cell');
  expect(cells[0]).toHaveTextContent(display);
  expect(cells[1]).toHaveTextContent(display);
  expect(cells[2]).toHaveTextContent(`Will receive ${display}`);
  expect(screen.getByRole('rowheader', { name: 'Rahul' }).closest('tr')).toHaveTextContent(`Will pay ${display}`);
  expect(document.querySelector('.split-results').textContent).not.toMatch(/\u20b9[\d,]+\.\d/);
  expect(result).toEqual(original);
});
