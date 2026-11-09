import { describe, it, expect } from 'vitest';
import { validateParticipantName, validateExpenseInput } from '../utils/validation.js';

describe('validateParticipantName', () => {
  it('rejects empty and whitespace-only names', () => {
    expect(validateParticipantName('', []).error).toBeTruthy();
    expect(validateParticipantName('   ', []).error).toBeTruthy();
  });
  it('trims the name', () => {
    expect(validateParticipantName('  Aman ', [])).toEqual({ value: 'Aman' });
  });
  it('rejects names over 50 characters', () => {
    expect(validateParticipantName('x'.repeat(51), []).error).toBeTruthy();
    expect(validateParticipantName('x'.repeat(50), []).value).toBeTruthy();
  });
  it('rejects duplicates ignoring case, but allows keeping your own name', () => {
    expect(validateParticipantName('aman', ['Aman', 'Rahul']).error).toMatch(/already added/i);
    expect(validateParticipantName('Aman', ['Rahul']).value).toBe('Aman'); // rename to same
  });
});

describe('validateExpenseInput', () => {
  const base = {
    description: 'Dinner', amountText: '120.50', payerId: 'p1',
    participantIds: ['p2'], validIds: ['p1', 'p2'],
  };

  it('accepts a payer who is not splitting the cost', () => {
    expect(validateExpenseInput(base).value).toEqual({
      description: 'Dinner', amountPaise: 12050, payerId: 'p1', participantIds: ['p2'],
    });
  });
  it('reports every problem at once', () => {
    const { errors, value } = validateExpenseInput({
      description: '  ', amountText: '0', payerId: '', participantIds: [], validIds: ['p1'],
    });
    expect(value).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(['amount', 'description', 'participants', 'payer']);
  });
  it('rejects a payer who is not in the list', () => {
    expect(validateExpenseInput({ ...base, payerId: 'ghost' }).errors.payer).toBeTruthy();
  });
  it('rejects descriptions over 200 characters', () => {
    expect(validateExpenseInput({ ...base, description: 'x'.repeat(201) }).errors.description).toBeTruthy();
  });
});