import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canGenerateIds, generateId, uuidV4FromRandomBytes } from '../utils/uuid.js';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const getRandomValuesOnly = { getRandomValues: (array) => webcrypto.getRandomValues(array) };

afterEach(() => vi.unstubAllGlobals());

describe('uuidV4FromRandomBytes', () => {
  it('sets the version and variant bits whatever the random bytes are', () => {
    expect(uuidV4FromRandomBytes(new Uint8Array(16).fill(0x00))).toBe('00000000-0000-4000-8000-000000000000');
    expect(uuidV4FromRandomBytes(new Uint8Array(16).fill(0xff))).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
  it('formats 16 known bytes in order (byte 6 gets 0x4_, byte 8 gets 0b10xx_xxxx)', () => {
    const bytes = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
    expect(uuidV4FromRandomBytes(bytes)).toBe('01020304-0506-4708-890a-0b0c0d0e0f10');
  });
  it('rejects the wrong number of bytes', () => {
    expect(() => uuidV4FromRandomBytes(new Uint8Array(15))).toThrow();
  });
});

describe('generateId', () => {
  it('uses crypto.randomUUID() when it is available', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'from-random-uuid', getRandomValues: vi.fn() });
    expect(generateId()).toBe('from-random-uuid');
  });

  it('falls back to getRandomValues and still produces a valid v4 UUID', () => {
    vi.stubGlobal('crypto', getRandomValuesOnly);
    for (let i = 0; i < 50; i += 1) expect(generateId()).toMatch(V4);
  });

  it('generates unique IDs on the fallback path', () => {
    vi.stubGlobal('crypto', getRandomValuesOnly);
    const ids = new Set(Array.from({ length: 2000 }, () => generateId()));
    expect(ids.size).toBe(2000);
  });

  it('never uses Math.random, on either path', () => {
    const spy = vi.spyOn(Math, 'random');
    vi.stubGlobal('crypto', getRandomValuesOnly);
    generateId();
    vi.stubGlobal('crypto', { randomUUID: () => 'x' });
    generateId();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('refuses to invent IDs when secure randomness is unavailable', () => {
    const spy = vi.spyOn(Math, 'random');
    vi.stubGlobal('crypto', {});
    expect(() => generateId()).toThrow(/secure random/i);
    vi.stubGlobal('crypto', undefined);
    expect(() => generateId()).toThrow(/secure random/i);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('canGenerateIds', () => {
  it('is true with randomUUID, true with only getRandomValues, false with neither', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'x' });
    expect(canGenerateIds()).toBe(true);
    vi.stubGlobal('crypto', getRandomValuesOnly);
    expect(canGenerateIds()).toBe(true);
    vi.stubGlobal('crypto', {});
    expect(canGenerateIds()).toBe(false);
    vi.stubGlobal('crypto', undefined);
    expect(canGenerateIds()).toBe(false);
  });
});
