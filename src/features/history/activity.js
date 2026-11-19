// These are recorded state transitions, not newly inferred payment records.
export function paymentEvents(transactions = []) {
  const events = [];
  for (const item of transactions) {
    if (item.reported_at) events.push({ id: `${item.id}:reported`, user: item.payer, receiver: item.receiver, amount: item.amount, at: item.reported_at, label: 'marked a payment as paid to', status: 'Payment marked as paid' });
    if (item.confirmed_at) events.push({ id: `${item.id}:confirmed`, user: item.receiver, receiver: item.payer, amount: item.amount, at: item.confirmed_at, label: 'confirmed a payment from', status: 'Payment confirmed' });
  }
  return events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id));
}

export function newestExpenses(items = []) {
  return [...items].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id));
}
