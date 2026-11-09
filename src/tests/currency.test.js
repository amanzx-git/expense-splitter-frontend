import { describe, it, expect } from 'vitest';
import { parseRupeesToPaise, formatPaise } from '../utils/currency.js';

describe('parseRupeesToPaise', () => {
  it.each([
    ['120', 12000], ['120.5', 12050], ['120.50', 12050], ['0.01', 1],
    ['007', 700], ['  45.10 ', 4510], ['9999999999.99', 999999999999],
  ])('accepts "%s"', (input, paise) => {
    expect(parseRupeesToPaise(input)).toEqual({ paise });
  });

  it.each([
    '', '   ', '0', '0.00', '-5', '120.555', '1e5', 'abc', '1,500', '.5', '120.', '10000000000.00',
  ])('rejects "%s"', (input) => {
    expect(parseRupeesToPaise(input).error).toBeTruthy();
  });
});

describe('formatPaise', () => {
  it('formats integer paise as two-decimal strings', () => {
    expect(formatPaise(12050)).toBe('120.50');
    expect(formatPaise(5)).toBe('0.05');
    expect(formatPaise(0)).toBe('0.00');
    expect(formatPaise(-15000)).toBe('-150.00');
  });
});