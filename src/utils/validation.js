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

// ---------- F3: account forms (R1.2-10) ----------
const USERNAME_RE = /^[a-z][a-z0-9_]{2,29}$/;
const UPI_RE = /^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,35}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateProfile({ username, full_name, upi_id }) {
  const value = { username: username.trim().toLowerCase(), full_name: full_name.trim(), upi_id: upi_id.trim() };
  const errors = {};
  if (!USERNAME_RE.test(value.username)) errors.username = 'Use 3–30 lowercase letters, digits or underscores, starting with a letter.';
  if (!value.full_name || value.full_name.length > 100) errors.full_name = 'Enter a full name of 1 to 100 characters.';
  if (value.upi_id && (value.upi_id.length > 100 || !UPI_RE.test(value.upi_id))) errors.upi_id = 'Enter a UPI ID like name@bank, without spaces.';
  return { errors, value: Object.keys(errors).length ? null : value };
}

// Passwords are never trimmed. Returns { password?, confirm? }.
export function validatePasswordPair(password, confirm) {
  const errors = {};
  if (password.length < 10) errors.password = 'Use at least 10 characters.';
  if (confirm !== password) errors.confirm = 'Passwords do not match.';
  return errors;
}

// Error keys use the API's field names so server errors map onto the same inputs.
export function validateRegistration({ username, fullName, email, password, confirmPassword, upiId }) {
  const errors = {};
  const uname = username.trim().toLowerCase();
  const name = fullName.trim();
  const mail = email.trim();
  const upi = upiId.trim();

  if (!USERNAME_RE.test(uname)) {
    errors.username = 'Use 3–30 characters: lowercase letters, digits or underscores, starting with a letter.';
  }
  if (name.length === 0) errors.full_name = 'Enter your full name.';
  else if (name.length > 100) errors.full_name = 'Use 100 characters or fewer.';
  if (mail.length === 0 || mail.length > 254 || !EMAIL_RE.test(mail)) errors.email = 'Enter a valid email address.';

  const pair = validatePasswordPair(password, confirmPassword);
  if (pair.password) errors.password = pair.password;
  if (pair.confirm) errors.confirm_password = pair.confirm;

  if (upi && (upi.length < 3 || upi.length > 100 || !UPI_RE.test(upi))) {
    errors.upi_id = 'Enter a UPI ID like name@bank. We only check the format.';
  }

  if (Object.keys(errors).length > 0) return { errors, value: null };
  const value = { username: uname, full_name: name, email: mail, password, confirm_password: confirmPassword };
  if (upi) value.upi_id = upi; // optional: omitted when empty
  return { errors: {}, value };
}
