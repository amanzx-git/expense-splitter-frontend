import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentTable from '../features/settlements/PaymentTable.jsx';

afterEach(cleanup);
const payment = { id: 'payment', payer: { id: 'payer', full_name: 'A very long payer name that must remain accessible' }, receiver: { id: 'receiver', full_name: 'A very long receiver name that must remain accessible' }, amount: '2466.70', status: 'pending' };
it.each([
  ['payer', 'pending', 'Pending', 'payment-direction--outgoing'],
  ['receiver', 'pending', 'Pending', 'payment-direction--incoming'],
  ['receiver', 'payment_reported', 'Awaiting confirmation', 'payment-direction--incoming'],
  ['payer', 'done', 'Completed', ''],
  ['other', 'pending', 'Pending', ''],
])('keeps compact rows accessible for %s and %s', async (userId, status, label, color) => {
  const onOpen = vi.fn();
  render(<PaymentTable items={[{ ...payment, status }]} userId={userId} onOpen={onOpen} />);
  const row = screen.getByRole('button', { name: `View payment from ${payment.payer.full_name} to ${payment.receiver.full_name}` });
  expect(row).toHaveAccessibleDescription(`₹2,466.70 ${label}`);
  expect(screen.getByTitle(payment.payer.full_name)).toHaveTextContent(payment.payer.full_name);
  expect(screen.queryByText('View details')).not.toBeInTheDocument();
  expect(row.querySelectorAll('button')).toHaveLength(0);
  const amount = row.querySelector('.money');
  expect(amount.className).toBe(`money${color ? ` ${color}` : ''}`);
  row.focus(); await userEvent.keyboard(' ');
  expect(onOpen).toHaveBeenCalledExactlyOnceWith(payment.id, row);
});
