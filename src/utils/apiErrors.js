import { ApiError, UNAVAILABLE_MESSAGE } from '../api/errors.js';

// Turns any thrown value into display data. knownFields = the inputs this form has.
// Unexpected `fields` keys are kept, never discarded (R1.2-10).
export function describeError(err, knownFields = []) {
  const base = { fieldErrors: {}, other: [], hint: '', unavailable: false };

  if (!(err instanceof ApiError)) {
    return { ...base, message: 'Something went wrong. Please try again.', code: 'UNEXPECTED', status: 0 };
  }

  if (err.unavailable) {
    return {
      ...base,
      message: UNAVAILABLE_MESSAGE,
      hint: err.outcomeUnknown
        ? 'This may have worked. Check before trying again.'
        : 'Please try again shortly.',
      code: err.code,
      status: err.status,
      unavailable: true,
    };
  }

  const fieldErrors = {};
  const other = [];
  for (const [name, messages] of Object.entries(err.fields)) {
    const text = Array.isArray(messages) ? messages.join(' ') : String(messages);
    if (knownFields.includes(name)) fieldErrors[name] = text;
    else other.push(`${name}: ${text}`); // shown in the alert, never silently dropped
  }
  return { ...base, message: err.message, fieldErrors, other, code: err.code, status: err.status };
}

// Add action context without claiming that an ambiguous connection failure rolled
// back a write. Keep all server field details and error classification unchanged.
export function describeActionError(err, action, knownFields = []) {
  const detail = describeError(err, knownFields);
  const rejected = err instanceof ApiError && !err.unavailable && err.status >= 400 && err.status < 500;
  return {
    ...detail,
    message: rejected ? `We couldn't ${action}. ${detail.message}` : `We couldn't confirm the result. ${detail.message}`,
    hint: rejected ? detail.hint : 'Check the current status before trying again.',
  };
}
