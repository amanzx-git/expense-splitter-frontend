// expense: { id, description, amountPaise, payerId, participantIds, date }

// What WOULD happen. Never changes anything.
export function planRemoval(personId, expenses) {
  const deleted = []; // paid by them, or they were the only one splitting it
  const changed = []; // they are taken out of the split, expense survives
  for (const e of expenses) {
    const remaining = e.participantIds.filter((id) => id !== personId);
    if (e.payerId === personId || remaining.length === 0) deleted.push(e);
    else if (remaining.length !== e.participantIds.length) changed.push(e);
  }
  return { deleted, changed };
}

// What DOES happen. Returns a new array; unrelated expenses are the same objects.
export function applyRemoval(personId, expenses) {
  return expenses
    .filter((e) => e.payerId !== personId)
    .map((e) =>
      e.participantIds.includes(personId)
        ? { ...e, participantIds: e.participantIds.filter((id) => id !== personId) }
        : e
    )
    .filter((e) => e.participantIds.length > 0);
}