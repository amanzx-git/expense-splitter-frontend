import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PaymentDirection, paymentDirectionClass, balanceDirectionClass } from '../features/settlements/paymentPresentation.jsx';
import PaymentTable from '../features/settlements/PaymentTable.jsx';

afterEach(cleanup);
const payment = { id: 't', payer: { id: 'payer', username: 'Aman' }, receiver: { id: 'receiver', username: 'Rahul' }, amount: '300.00', status: 'pending' };

it.each([
  ['pending', 'You will receive'],
  ['payment_reported', 'Aman marked'],
  ['done', 'You received'],
])('describes receipt timing without claiming early success: %s', (status, phrase) => {
  const { container } = render(<PaymentDirection item={{ ...payment, status }} userId="receiver" />);
  expect(container).toHaveTextContent(phrase);
  if (status !== 'done') expect(container).not.toHaveTextContent('You received');
  if (status === 'payment_reported') expect(container).toHaveTextContent('as paid to you');
});
it.each([['payer', 'payment-direction--outgoing'], ['receiver', 'payment-direction--incoming'], ['other', '']])('uses actual payment parties for viewer %s', (id, direction) => {
  expect(paymentDirectionClass(payment, id)).toBe(direction);
  render(<PaymentDirection item={payment} userId={id} />);
  const line = document.querySelector('span');
  expect(line.className).toBe('');
  expect(line.querySelector('.money').className).toBe(`money${direction ? ' '+direction : ''}`);
  expect(document.querySelectorAll('[class*="payment-direction--"]:not(.money)')).toHaveLength(0);
  expect(line).toHaveTextContent('₹300.00');
});
it('keeps completed, unknown and anonymous payments neutral and reported payments directional', () => {
  expect(paymentDirectionClass({ ...payment, status: 'done' }, 'receiver')).toBe('');
  expect(paymentDirectionClass({ ...payment, status: 'unknown' }, 'payer')).toBe('');
  expect(paymentDirectionClass(payment, undefined)).toBe('');
  expect(paymentDirectionClass({ ...payment, status: 'payment_reported' }, 'payer')).toBe('payment-direction--outgoing');
  expect(balanceDirectionClass('0.00')).toBe('');
  expect(balanceDirectionClass('-300.00')).toBe('payment-direction--outgoing');
  expect(balanceDirectionClass('300.00')).toBe('payment-direction--incoming');
});
it('colors only settlement amounts while preserving neutral rows and independent status', () => {
  const { rerender } = render(<PaymentTable items={[payment]} userId="receiver" onOpen={() => {}} />);
  expect(screen.getByRole('button', { name: 'View payment from Aman to Rahul' })).not.toHaveClass('payment-direction--incoming');
  expect(screen.getByText('₹300.00')).toHaveClass('payment-direction--incoming');
  expect(screen.getByText('Pending')).not.toHaveClass('payment-direction--incoming');
  rerender(<PaymentTable items={[{ ...payment, status: 'done' }]} userId="receiver" onOpen={() => {}} />);
  expect(screen.getByRole('button', { name: 'View payment from Aman to Rahul' })).not.toHaveClass('payment-direction--incoming');
  expect(screen.getByText('₹300.00')).not.toHaveClass('payment-direction--incoming', 'payment-direction--outgoing');
});
