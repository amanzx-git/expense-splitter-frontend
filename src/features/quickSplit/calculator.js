// Deterministic Quick Split maths (R1.2-05). Integer paise only.

// Plain string comparison, NOT localeCompare (which depends on the browser locale).
export function compareIds(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Split amountPaise equally. The leftover paise go +1 each to the earliest
// participants in ascending UUID order. Result always sums to amountPaise.
export function splitEqually(amountPaise, participantIds) {
  const ids = [...participantIds].sort(compareIds);
  const base = Math.floor(amountPaise / ids.length);
  const remainder = amountPaise % ids.length;
  return ids.map((id, i) => ({ id, paise: base + (i < remainder ? 1 : 0) }));
}

// participants: [{id,name}]  expenses: [{amountPaise,payerId,participantIds}]
export function calculate(participants, expenses) {
  const paid = new Map(participants.map((p) => [p.id, 0]));
  const owed = new Map(participants.map((p) => [p.id, 0]));

  for (const e of expenses) {
    paid.set(e.payerId, paid.get(e.payerId) + e.amountPaise);
    for (const s of splitEqually(e.amountPaise, e.participantIds)) {
      owed.set(s.id, owed.get(s.id) + s.paise);
    }
  }

  const people = participants.map((p) => ({
    id: p.id,
    name: p.name,
    paid: paid.get(p.id),
    owed: owed.get(p.id),
    net: paid.get(p.id) - owed.get(p.id), // + gets money back, - must pay
  }));

  // Largest amount first, ties broken by ascending UUID.
  const byAmountThenId = (a, b) => b.amount - a.amount || compareIds(a.id, b.id);
  const debtors = people.filter((p) => p.net < 0).map((p) => ({ id: p.id, amount: -p.net })).sort(byAmountThenId);
  const creditors = people.filter((p) => p.net > 0).map((p) => ({ id: p.id, amount: p.net })).sort(byAmountThenId);

  // Greedy two-pointer match; zero transfers are never produced.
  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const amount = Math.min(d.amount, c.amount);
    transfers.push({ fromId: d.id, toId: c.id, paise: amount });
    d.amount -= amount;
    c.amount -= amount;
    if (d.amount === 0) i++;
    if (c.amount === 0) j++;
  }

  return { people, transfers };
}