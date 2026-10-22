/**
 * Unit tests for the decimal-money helpers.
 *
 * Money must never round-trip through a JavaScript `number` (0.1 + 0.2 !== 0.3), so these tests
 * focus on the string-level guarantees: what is accepted, and what padding/truncation produces.
 */
import { describe, expect, it } from 'vitest';
import { MONEY_PATTERN, normaliseMoney } from './money.util.js';

describe('MONEY_PATTERN', () => {
  it.each([
    ['0', true],
    ['0.5', true],
    ['0.05', true],
    ['199.90', true],
    ['999999999999.99', true],
  ])('accepts %s', (value, expected) => {
    expect(MONEY_PATTERN.test(value)).toBe(expected);
  });

  it.each([
    ['-1', 'negative amounts'],
    ['1.234', 'more than two decimal places'],
    ['1e3', 'scientific notation'],
    ['1.2.3', 'two decimal points'],
    ['', 'empty string'],
    [' 1.00', 'leading whitespace'],
    ['1,00', 'comma decimal separator'],
    ['9999999999999.99', 'more than twelve integer digits'],
  ])('rejects %s (%s)', (value) => {
    expect(MONEY_PATTERN.test(value)).toBe(false);
  });
});

describe('normaliseMoney', () => {
  it('pads a whole amount to the default scale of two', () => {
    expect(normaliseMoney('199')).toBe('199.00');
  });

  it('pads a single decimal place', () => {
    expect(normaliseMoney('199.9')).toBe('199.90');
  });

  it('leaves an already-normalised amount unchanged', () => {
    expect(normaliseMoney('199.90')).toBe('199.90');
  });

  it('trims surrounding whitespace rather than failing', () => {
    expect(normaliseMoney('  12.3  ')).toBe('12.30');
  });

  it('truncates (never rounds) extra decimals, because callers must validate first', () => {
    // 1.239 truncates to 1.23. Rounding here would silently change an amount, which is worse.
    expect(normaliseMoney('1.239')).toBe('1.23');
  });

  it('honours a custom scale', () => {
    expect(normaliseMoney('1.5', 4)).toBe('1.5000');
    expect(normaliseMoney('1.5', 0)).toBe('1.');
  });
});
