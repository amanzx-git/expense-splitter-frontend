import { describe, expect, it } from 'vitest';
import { safeNext } from '../utils/safeNext.js';
import { validatePasswordPair, validateRegistration } from '../utils/validation.js';

describe('safeNext', () => {
  it.each([['/dashboard'], ['/groups/1?tab=a'], ['/']])('allows %s', (v) => {
    expect(safeNext(v)).toBe(v);
  });
  it.each([['//evil.com'], ['https://evil.com'], ['/\\evil.com'], ['dashboard'], [''], [null], [undefined]])(
    'rejects %s',
    (v) => expect(safeNext(v)).toBeNull()
  );
});

describe('validatePasswordPair', () => {
  it('requires 10+ characters and a matching confirmation', () => {
    expect(validatePasswordPair('123456789', '123456789').password).toBeTruthy();
    expect(validatePasswordPair('1234567890', 'different').confirm).toBeTruthy();
    expect(validatePasswordPair('1234567890', '1234567890')).toEqual({});
  });
});

describe('validateRegistration', () => {
  const ok = {
    username: 'Priya_K', fullName: ' Priya K ', email: 'priya@example.com',
    password: 'a-long-password', confirmPassword: 'a-long-password', upiId: '',
  };

  it('normalizes and omits an empty UPI ID', () => {
    expect(validateRegistration(ok).value).toEqual({
      username: 'priya_k', full_name: 'Priya K', email: 'priya@example.com',
      password: 'a-long-password', confirm_password: 'a-long-password',
    });
  });
  it('keeps a valid UPI ID', () => {
    expect(validateRegistration({ ...ok, upiId: 'priya@upi' }).value.upi_id).toBe('priya@upi');
  });
  it.each([['ab'], ['1abc'], ['a-b'], ['has space'], ['a'.repeat(31)]])('rejects username "%s"', (u) => {
    expect(validateRegistration({ ...ok, username: u }).errors.username).toBeTruthy();
  });
  it.each([['no-at-sign'], ['a b@upi'], ['@upi']])('rejects UPI "%s"', (u) => {
    expect(validateRegistration({ ...ok, upiId: u }).errors.upi_id).toBeTruthy();
  });
  it('rejects blank name, bad email, short or mismatched password', () => {
    const { errors, value } = validateRegistration({
      ...ok, fullName: '  ', email: 'nope', password: 'short', confirmPassword: 'other',
    });
    expect(value).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(['confirm_password', 'email', 'full_name', 'password']);
  });
});
