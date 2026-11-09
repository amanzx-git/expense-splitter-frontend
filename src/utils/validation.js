import { parseRupeesToPaise } from './currency.js';

// -> { value } or { error }. otherNames = names of the OTHER people.
export function validateParticipantName(raw, otherNames) {
  const name = raw.trim();
  if (name.length === 0) return { error: 'Enter a name.' };
  if (name.length > 50) return { error: 'Use 50 characters or fewer.' };
  const taken = otherNames.some((n) => n.toLowerCase() === name.toLowerCase());
  if (taken) return { error: 'That name is already added.' };
  return { value: name };
}

// -> { errors, value }. value is null when any error exists.
export function validateExpenseInput({ description, amountText, payerId, participantIds, validIds }) {
  const errors = {};
  const desc = description.trim();
  if (desc.length === 0) errors.description = 'Enter a description.';
  else if (desc.length > 200) errors.description = 'Use 200 characters or fewer.';

  const parsed = parseRupeesToPaise(amountText);
  if (parsed.error) errors.amount = parsed.error;

  // The payer does NOT have to be one of the people splitting the cost.
  if (!validIds.includes(payerId)) errors.payer = 'Choose who paid.';
  if (participantIds.length === 0) errors.participants = 'Select at least one person to split with.';

  if (Object.keys(errors).length > 0) return { errors, value: null };
  return {
    errors: {},
    value: { description: desc, amountPaise: parsed.paise, payerId, participantIds },
  };
}