import { api } from '../../api/client.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const EVENT_LABELS = {
  comment_mentioned: 'You were mentioned',
  invitation_received: 'Invitation received', invitation_accepted: 'Invitation accepted', invitation_declined: 'Invitation declined',
  expense_added: 'Expense added', settlement_created: 'Payments ready', payment_reported: 'Payment needs confirmation', payment_confirmed: 'Payment confirmed',
};

// A stale or legacy report is a recorded event, not proof of an outstanding action
// or completed transfer. This changes its title only, never its routing/read state.
export function notificationTitle(note) {
  if (isAssignedExpenseNotice(note)) return 'Expense added for you';
  if (note.type === 'payment_reported' && note.action_required !== true) return 'Payment marked as paid';
  return EVENT_LABELS[note.type] ?? 'Notification';
}

// B8 has no assignment flag; recognize only the server's existing payer-specific templates.
export const isAssignedExpenseNotice = (note) => note.type === 'expense_added' && /(?:, paid by you, in | expense as paid by you in )/.test(note.message || '');

export function notificationPresentation(note) {
  const mention = note.type === 'comment_mentioned' && /^(@\w+) mentioned you in (.+)$/.exec(note.message || '');
  if (mention) return { actor: mention[1], group: mention[2] };
  // Extract only complete known server templates, never infer unavailable transaction fields.
  const assigned = note.type === 'expense_added' && /^(.*?) added (?:a )?₹(\d+\.\d{2})(?:, paid by you, in | expense as paid by you in )(.+)\.$/.exec(note.message || '');
  if (assigned) return { amount: assigned[2], group: assigned[3], actor: assigned[1] };
  const withAmount = note.type === 'expense_added' && /^(@\w+) added a ₹(\d+\.\d{2}) expense to (.+)$/.exec(note.message || '');
  if (withAmount) return { actor: withAmount[1], amount: withAmount[2], group: withAmount[3] };
  const expense = note.type === 'expense_added' && /^(@\w+) added an expense to (.+)$/.exec(note.message || '');
  if (expense) return { group: expense[2], actor: expense[1] };
  const settlement = note.type === 'settlement_created' && /^A settlement is ready for (.+)$/.exec(note.message || '');
  if (settlement) return { group: settlement[1] };
  return { text: notificationMessage(note) };
}

export const notificationMessage = (note) => ({
  settlement_created: note.message,
  payment_reported: note.message,
  payment_confirmed: 'The receiver confirmed your payment.',
}[note.type] || note.message);

export async function notificationTarget(note, signal) {
  if (!EVENT_LABELS[note.type]) return '/dashboard';
  if (note.related_type === 'invitation' && note.type.startsWith('invitation_')) return UUID.test(note.related_id ?? '') ? '/invitations' : '/dashboard';
  if (!UUID.test(note.group_id ?? '')) return '/dashboard';
  try {
    if (note.type === 'comment_mentioned') {
      if (note.related_type !== 'comment' || !UUID.test(note.related_id ?? '')) return '/dashboard';
      const result = await api.get(`/groups/${note.group_id}/comments/?page=1&comment_id=${note.related_id}`, { signal });
      return result.results.some((item) => item.id === note.related_id && item.group_id === note.group_id) ? `/groups/${note.group_id}?panel=discussion&comment=${note.related_id}` : '/dashboard';
    }
    if (note.related_type === 'settlement' && UUID.test(note.related_id ?? '')) {
      const result = await api.get(`/settlements/${note.related_id}/`, { signal });
      if (result.settlement.group_id !== note.group_id) return '/dashboard';
      const target = `/groups/${note.group_id}/settlements/${note.related_id}`;
      if (note.payment_id != null && ['payment_reported', 'payment_confirmed'].includes(note.type)) {
        if (!UUID.test(note.payment_id) || !result.settlement.transactions?.some((item) => item.id === note.payment_id)) return '/dashboard';
        return `${target}?payment=${note.payment_id}`;
      }
      return target;
    }
    if (note.related_type === 'expense' && UUID.test(note.related_id ?? '')) {
      const result = await api.get(`/expenses/${note.related_id}/`, { signal });
      return result.expense.group_id === note.group_id ? `/groups/${note.group_id}?expense=${note.related_id}` : '/dashboard';
    }
    await api.get(`/groups/${note.group_id}/`, { signal });
    return `/groups/${note.group_id}`;
  } catch (err) {
    if (err.status === 403 || err.status === 404) return '/dashboard';
    throw err;
  }
}
