import { describe, it, expect } from 'vitest';
import { planRemoval, applyRemoval } from '../features/quickSplit/removal.js';

const [A, B, C] = ['A', 'B', 'C'];
const mk = (id, payerId, participantIds) => ({
  id, description: id, amountPaise: 1000, payerId, participantIds, date: '',
});
const expenses = [
  mk('paid', B, [A, B, C]), // B paid -> deleted
  mk('shared', A, [A, B, C]), // B only a participant -> changed
  mk('solo', A, [B]), // B was the only splitter -> deleted
  mk('other', C, [A, C]), // unrelated -> untouched
];

describe('planRemoval', () => {
  it('sorts expenses into deleted, changed and unaffected', () => {
    const { deleted, changed } = planRemoval(B, expenses);
    expect(deleted.map((e) => e.id)).toEqual(['paid', 'solo']);
    expect(changed.map((e) => e.id)).toEqual(['shared']);
  });
  it('is empty for someone no expense mentions', () => {
    expect(planRemoval('nobody', expenses)).toEqual({ deleted: [], changed: [] });
  });
});

describe('applyRemoval', () => {
  it('does exactly what the plan said', () => {
    const plan = planRemoval(B, expenses);
    const after = applyRemoval(B, expenses);
    expect(after.map((e) => e.id)).toEqual(['shared', 'other']);
    expect(after.map((e) => e.id)).toEqual(
      expenses.filter((e) => !plan.deleted.includes(e)).map((e) => e.id)
    );
    expect(after.find((e) => e.id === 'shared').participantIds).toEqual([A, C]);
  });
  it('keeps unrelated expenses as the very same objects', () => {
    const after = applyRemoval(B, expenses);
    expect(after.find((e) => e.id === 'other')).toBe(expenses[3]);
  });
  it('never mutates its input', () => {
    const snapshot = structuredClone(expenses);
    applyRemoval(B, expenses);
    expect(expenses).toEqual(snapshot);
  });
});