import { describe, it, expect } from 'vitest';
import { calculate, splitEqually } from '../features/quickSplit/calculator.js';

// Fixed IDs so tie-breaks are predictable: A < B < C in string order.
const A = '00000000-0000-4000-8000-000000000001'; // Aman
const B = '00000000-0000-4000-8000-000000000002'; // Rahul
const C = '00000000-0000-4000-8000-000000000003'; // Priya
const people = [{ id: A, name: 'Aman' }, { id: B, name: 'Rahul' }, { id: C, name: 'Priya' }];
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

describe('splitEqually', () => {
  it('gives leftover paise to the earliest UUIDs, whatever the input order', () => {
    const shares = splitEqually(10000, [C, A, B]);
    expect(shares).toEqual([
      { id: A, paise: 3334 }, { id: B, paise: 3333 }, { id: C, paise: 3333 },
    ]);
    expect(sum(shares.map((s) => s.paise))).toBe(10000);
  });

  it('handles an amount smaller than the head count', () => {
    const shares = splitEqually(1, [A, B, C]);
    expect(shares.map((s) => s.paise)).toEqual([1, 0, 0]);
  });
});

describe('calculate', () => {
  it('matches the canonical worked example', () => {
    const expenses = [
      { amountPaise: 90000, payerId: A, participantIds: [A, B, C] }, // dinner
      { amountPaise: 30000, payerId: B, participantIds: [B, C] }, // taxi
    ];
    const { people: out, transfers } = calculate(people, expenses);
    expect(out.map((p) => p.net)).toEqual([60000, -15000, -45000]);
    expect(transfers).toEqual([
      { fromId: C, toId: A, paise: 45000 }, // biggest debtor first
      { fromId: B, toId: A, paise: 15000 },
    ]);
  });

  it('allows a payer who is not a participant, with ties broken by UUID', () => {
    const { people: out, transfers } = calculate(people, [
      { amountPaise: 10000, payerId: A, participantIds: [B, C] },
    ]);
    expect(out[0]).toMatchObject({ paid: 10000, owed: 0, net: 10000 });
    expect(transfers).toEqual([
      { fromId: B, toId: A, paise: 5000 },
      { fromId: C, toId: A, paise: 5000 },
    ]);
  });

  it('produces no transfers when everyone nets to zero', () => {
    const { people: out, transfers } = calculate(people, [
      { amountPaise: 5000, payerId: A, participantIds: [A, B] },
      { amountPaise: 5000, payerId: B, participantIds: [A, B] },
    ]);
    expect(out.every((p) => p.net === 0)).toBe(true);
    expect(transfers).toEqual([]);
  });

  it('keeps nets summing to zero with awkward amounts', () => {
    const expenses = [
      { amountPaise: 10001, payerId: A, participantIds: [A, B, C] },
      { amountPaise: 3333, payerId: C, participantIds: [A, C] },
      { amountPaise: 7, payerId: B, participantIds: [A, B, C] },
    ];
    const { people: out, transfers } = calculate(people, expenses);
    expect(sum(out.map((p) => p.net))).toBe(0);
    const credit = sum(out.filter((p) => p.net > 0).map((p) => p.net));
    expect(sum(transfers.map((t) => t.paise))).toBe(credit);
    expect(transfers.every((t) => t.paise > 0)).toBe(true);
  });

  it('gives the same transfers regardless of input order', () => {
    const expenses = [
      { amountPaise: 10001, payerId: A, participantIds: [A, B, C] },
      { amountPaise: 3333, payerId: C, participantIds: [A, C] },
    ];
    const one = calculate(people, expenses).transfers;
    const two = calculate([...people].reverse(), [...expenses].reverse()).transfers;
    expect(two).toEqual(one);
  });
});