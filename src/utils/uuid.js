// Quick Split IDs (R1.2-05). Prefer crypto.randomUUID(); where it is missing (it exists
// only in secure contexts: https or localhost) build a UUID v4 from
// crypto.getRandomValues(), which works everywhere. Math.random() is never used:
// it is predictable and is not a safe source for identifiers.

// bytes: 16 random bytes -> a v4 UUID string. Pure, so it can be tested with fixed bytes.
export function uuidV4FromRandomBytes(bytes) {
  if (bytes.length !== 16) throw new Error('A UUID needs exactly 16 bytes.');
  const b = Uint8Array.from(bytes);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function canGenerateIds() {
  const c = globalThis.crypto;
  return Boolean(c) && (typeof c.randomUUID === 'function' || typeof c.getRandomValues === 'function');
}

export function generateId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  if (c && typeof c.getRandomValues === 'function') {
    return uuidV4FromRandomBytes(c.getRandomValues(new Uint8Array(16)));
  }
  throw new Error('Secure random numbers are not available in this environment.');
}
