/**
 * Unit tests for password hashing.
 *
 * The stored digest is self-describing and constant-time verified. Two failure modes matter most:
 * a wrong password must not verify, and a corrupt stored value must return `false` rather than
 * throw — a malformed row must never turn into a 500 on the login endpoint.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCRYPT_PARAMETERS,
  hashPassword,
  verifyPassword,
} from './password-hash.js';

// scrypt is intentionally CPU-heavy; a smaller cost parameter keeps the suite fast while still
// exercising the same code path end to end.
const FAST_PARAMETERS = { ...DEFAULT_SCRYPT_PARAMETERS, N: 1024 };

describe('hashPassword', () => {
  it('produces a self-describing digest with the parameters embedded', async () => {
    const digest = await hashPassword('correct horse battery staple', FAST_PARAMETERS);
    const [scheme, parameters] = digest.split('$');
    expect(scheme).toBe('scrypt');
    expect(parameters).toBe('N=1024,r=8,p=1,len=64');
    expect(digest.split('$')).toHaveLength(4);
  });

  it('uses a fresh salt each time, so identical passwords hash differently', async () => {
    const [first, second] = await Promise.all([
      hashPassword('same-password', FAST_PARAMETERS),
      hashPassword('same-password', FAST_PARAMETERS),
    ]);
    expect(first).not.toBe(second);
  });

  it('never embeds the plaintext password', async () => {
    const digest = await hashPassword('plaintext-secret', FAST_PARAMETERS);
    expect(digest).not.toContain('plaintext-secret');
  });
});

describe('verifyPassword', () => {
  it('accepts the correct password', async () => {
    const digest = await hashPassword('correct horse battery staple', FAST_PARAMETERS);
    await expect(verifyPassword('correct horse battery staple', digest)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const digest = await hashPassword('correct horse battery staple', FAST_PARAMETERS);
    await expect(verifyPassword('Correct horse battery staple', digest)).resolves.toBe(false);
  });

  it('accepts a password that differs only by Unicode composition (NFKC normalisation)', async () => {
    // U+00E9 (é as one code point) vs U+0065 U+0301 (e + combining acute) are visually identical.
    const digest = await hashPassword('caf\u00e9', FAST_PARAMETERS);
    await expect(verifyPassword('cafe\u0301', digest)).resolves.toBe(true);
  });

  it('honours the parameters stored in the digest, not the current defaults', async () => {
    const digest = await hashPassword('legacy-password', FAST_PARAMETERS);
    expect(digest).toContain('N=1024,');
    await expect(verifyPassword('legacy-password', digest)).resolves.toBe(true);
  });

  it.each([
    ['', 'empty string'],
    ['not-a-hash', 'arbitrary text'],
    ['scrypt$N=16384,r=8,p=1,len=64$only-three-parts', 'missing the derived key'],
    ['bcrypt$N=16384,r=8,p=1,len=64$c2FsdA==$ZGVyaXZlZA==', 'unknown scheme'],
    ['scrypt$N=bad,r=8,p=1,len=64$c2FsdA==$ZGVyaXZlZA==', 'non-numeric parameter'],
  ])('returns false for a malformed stored value: %s (%s)', async (stored) => {
    await expect(verifyPassword('anything', stored)).resolves.toBe(false);
  });
});
