// All money logic uses INTEGER PAISE (1 rupee = 100 paise). Never floats.
const MAX_PAISE = 999999999999; // ₹9,999,999,999.99 (R1.2-10)

// Text -> { paise } or { error }. Pure string parsing; no parseFloat.
export function parseRupeesToPaise(text) {
  const t = text.trim();
  if (t === '') return { error: 'Enter an amount.' };
  if (t.startsWith('-')) return { error: 'Amount must be greater than zero.' };
  if (/^\d+\.\d{3,}$/.test(t)) return { error: 'Use at most two decimal places.' };
  if (!/^\d+(\.\d{1,2})?$/.test(t)) {
    return { error: 'Enter a plain number such as 120 or 120.50.' };
  }

  const [whole, frac = ''] = t.split('.');
  const wholeTrimmed = whole.replace(/^0+(?=\d)/, ''); // "007" -> "7"
  if (wholeTrimmed.length > 10) return { error: 'Amount is too large.' };

  const paise = Number(wholeTrimmed) * 100 + Number(frac.padEnd(2, '0'));
  if (paise === 0) return { error: 'Amount must be greater than zero.' };
  if (paise > MAX_PAISE) return { error: 'Amount is too large.' };
  return { paise };
}

// Integer paise -> "120.50" (also "-150.00"). Integer maths only.
export function formatPaise(paise) {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}