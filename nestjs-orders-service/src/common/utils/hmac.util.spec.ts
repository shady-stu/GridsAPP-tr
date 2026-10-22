/**
 * Unit tests for the webhook HMAC primitives.
 *
 * These functions are the cryptographic boundary of the service, so the tests cover the exact
 * header grammar, the digest computation and the constant-time comparison — including the
 * "different length" path, which must return `false` without throwing.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  MalformedSignatureHeaderError,
  computeSignature,
  isTimestampWithinTolerance,
  parseSignatureHeader,
  timingSafeEqualHex,
} from './hmac.util.js';

const SECRET = 'test-only-webhook-secret-000000000000000000000000';
const VALID_HEX = 'a'.repeat(64);

describe('parseSignatureHeader', () => {
  it('parses a Stripe-style header', () => {
    expect(parseSignatureHeader(`t=1735689600,v1=${VALID_HEX}`)).toEqual({
      timestampSeconds: 1_735_689_600,
      signatures: [VALID_HEX],
    });
  });

  it('accepts several v1 signatures (secret rotation) and lower-cases them', () => {
    const upper = 'B'.repeat(64);
    const parsed = parseSignatureHeader(`t=100,v1=${VALID_HEX},v1=${upper}`);
    expect(parsed.signatures).toEqual([VALID_HEX, 'b'.repeat(64)]);
  });

  it('ignores unknown segments such as a future v2 scheme', () => {
    const parsed = parseSignatureHeader(`t=100,v2=whatever,v1=${VALID_HEX}`);
    expect(parsed.signatures).toEqual([VALID_HEX]);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseSignatureHeader(` t=100 , v1=${VALID_HEX} `).timestampSeconds).toBe(100);
  });

  it.each([
    ['', 'empty header'],
    ['v1=' + VALID_HEX, 'missing timestamp'],
    ['t=100', 'missing signature'],
    ['t=notanumber,v1=' + VALID_HEX, 'non-numeric timestamp'],
    ['t=100,v1=short', 'signature that is not a 64-char hex digest'],
    ['t=100,v1=' + 'z'.repeat(64), 'signature with non-hex characters'],
    ['nonsense', 'segment without key=value'],
  ])('rejects %s (%s)', (header) => {
    expect(() => parseSignatureHeader(header)).toThrow(MalformedSignatureHeaderError);
  });
});

describe('computeSignature', () => {
  it('is HMAC-SHA256 over "<timestamp>.<raw body>"', () => {
    const body = '{"hello":"world"}';
    const expected = createHmac('sha256', SECRET).update(`1700.${body}`).digest('hex');
    expect(computeSignature(SECRET, 1700, body)).toBe(expected);
  });

  it('produces the same digest for a Buffer and for the equivalent string', () => {
    const body = '{"a":1}';
    expect(computeSignature(SECRET, 42, Buffer.from(body, 'utf8'))).toBe(
      computeSignature(SECRET, 42, body),
    );
  });

  it('depends on the timestamp, so a captured body cannot be replayed with a new time', () => {
    const body = '{"a":1}';
    expect(computeSignature(SECRET, 1, body)).not.toBe(computeSignature(SECRET, 2, body));
  });
});

describe('timingSafeEqualHex', () => {
  it('returns true for identical digests', () => {
    expect(timingSafeEqualHex(VALID_HEX, VALID_HEX)).toBe(true);
  });

  it('returns false for different digests of the same length', () => {
    expect(timingSafeEqualHex(VALID_HEX, 'b'.repeat(64))).toBe(false);
  });

  it('returns false (rather than throwing) when the lengths differ', () => {
    expect(timingSafeEqualHex(VALID_HEX, 'abc')).toBe(false);
    expect(timingSafeEqualHex('', VALID_HEX)).toBe(false);
  });
});

describe('isTimestampWithinTolerance', () => {
  const nowMs = 1_700_000_000_000; // 2023-11-14T22:13:20Z

  it('accepts a timestamp inside the window on either side', () => {
    const nowSeconds = Math.floor(nowMs / 1000);
    expect(isTimestampWithinTolerance(nowSeconds, 300, nowMs)).toBe(true);
    expect(isTimestampWithinTolerance(nowSeconds - 300, 300, nowMs)).toBe(true);
    expect(isTimestampWithinTolerance(nowSeconds + 300, 300, nowMs)).toBe(true);
  });

  it('rejects a timestamp outside the window', () => {
    const nowSeconds = Math.floor(nowMs / 1000);
    expect(isTimestampWithinTolerance(nowSeconds - 301, 300, nowMs)).toBe(false);
    expect(isTimestampWithinTolerance(nowSeconds + 301, 300, nowMs)).toBe(false);
  });
});
