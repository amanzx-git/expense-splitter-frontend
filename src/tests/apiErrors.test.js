import { describe, expect, it } from 'vitest';
import { ApiError, UNAVAILABLE_MESSAGE, unavailableError } from '../api/errors.js';
import { describeActionError, describeError } from '../utils/apiErrors.js';

describe('describeError', () => {
  it('uses the exact friendly message for any outage', () => {
    for (const kind of ['network', 'gateway', 'bad_response']) {
      const d = describeError(unavailableError(kind));
      expect(d.message).toBe('We cannot connect right now. Please try again.');
      expect(d.message).toBe(UNAVAILABLE_MESSAGE);
      expect(d.unavailable).toBe(true);
      expect(d.hint).toMatch(/try again/i);
    }
  });

  it('warns that a timed-out request may have gone through', () => {
    const d = describeError(unavailableError('timeout'));
    expect(d.unavailable).toBe(true);
    expect(d.hint).toMatch(/may have worked/i);
  });

  it('keeps normal API errors separate: server message, field errors and unexpected keys', () => {
    const err = new ApiError({
      status: 400, code: 'VALIDATION_ERROR', message: 'Please correct the highlighted fields.',
      fields: { email: ['Enter a valid email address.'], surprise: ['Unexpected.'] },
    });
    const d = describeError(err, ['email']);
    expect(d.unavailable).toBe(false);
    expect(d.message).toBe('Please correct the highlighted fields.');
    expect(d.fieldErrors).toEqual({ email: 'Enter a valid email address.' });
    expect(d.other).toEqual(['surprise: Unexpected.']);
  });

  it('shows the server message for a real 500', () => {
    const err = new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Boom.', kind: 'server' });
    const d = describeError(err);
    expect(d.unavailable).toBe(false);
    expect(d.message).toBe('Boom.');
  });

  it('handles values that are not ApiErrors', () => {
    const d = describeError(new Error('programming mistake'));
    expect(d.unavailable).toBe(false);
    expect(d.code).toBe('UNEXPECTED');
  });
});

it('states that a rejected action failed without losing its specific reason or fields', () => {
  const error = new ApiError({ status: 409, code: 'INVALID_PAYMENT_STATE', message: 'This payment is already confirmed.', fields: { payment: ['Refresh the payment.'] } });
  const result = describeActionError(error, 'confirm receipt', ['payment']);
  expect(result.message).toBe("We couldn't confirm receipt. This payment is already confirmed.");
  expect(result.code).toBe('INVALID_PAYMENT_STATE');
  expect(result.status).toBe(409);
  expect(result.fieldErrors.payment).toBe('Refresh the payment.');
});

it.each(['timeout', 'network', 'bad_response'])('does not claim a write failed when its result is unknown: %s', (kind) => {
  const result = describeActionError(unavailableError(kind), 'delete your account');
  expect(result.message).toContain("We couldn't confirm the result.");
  expect(result.message).not.toContain("We couldn't delete your account.");
  expect(result.hint).toBe('Check the current status before trying again.');
  expect(result.unavailable).toBe(true);
});
