/**
 * Webhook signature primitives (HMAC-SHA256).
 *
 * Header format — Stripe-compatible, deliberately simple to document and to test:
 *
 * ```
 * x-webhook-signature: t=1735689600,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
 * ```
 *
 * * `t`  — Unix timestamp **in seconds**, when the provider generated the signature.
 * * `v1` — hex-encoded `HMAC_SHA256(secret, "<t>.<exact raw request body>")`.
 *
 * Design decisions:
 *  * The signature covers the **raw bytes** of the request body, not a re-serialised
 *    object. Parsing and re-stringifying JSON is not canonical, so the raw body must be
 *    captured before the body parser (see `main.ts`, `rawBody: true`).
 *  * Comparison is done with `crypto.timingSafeEqual` so a wrong signature leaks no
 *    information through response timing.
 *  * `t` is verified against a tolerance window, otherwise a captured request could be
 *    replayed forever.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface ParsedSignatureHeader {
  /** Unix timestamp in seconds supplied by the provider. */
  timestampSeconds: number;
  /** One or more `v1` signatures (providers rotate secrets; accept any match). */
  signatures: string[];
}

export class MalformedSignatureHeaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MalformedSignatureHeaderError';
  }
}

const HEX_64 = /^[0-9a-f]{64}$/i;

/**
 * Parse `t=<seconds>,v1=<hex>[,v1=<hex>...]`.
 * Throws `MalformedSignatureHeaderError` for anything we cannot trust.
 */
export function parseSignatureHeader(header: string): ParsedSignatureHeader {
  if (typeof header !== 'string' || header.trim().length === 0) {
    throw new MalformedSignatureHeaderError('Signature header is empty');
  }

  const parts = header.split(',').map((part) => part.trim());
  let timestampSeconds: number | undefined;
  const signatures: string[] = [];

  for (const part of parts) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) {
      throw new MalformedSignatureHeaderError(`Signature header segment "${part}" is not key=value`);
    }
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();

    if (key === 't') {
      if (!/^\d{1,12}$/.test(value)) {
        throw new MalformedSignatureHeaderError('Signature header timestamp must be integer seconds');
      }
      timestampSeconds = Number.parseInt(value, 10);
      continue;
    }

    if (key === 'v1') {
      if (!HEX_64.test(value)) {
        throw new MalformedSignatureHeaderError('Signature header v1 must be a 64-character hex digest');
      }
      signatures.push(value.toLowerCase());
      continue;
    }

    // Unknown keys (e.g. future `v2=`) are ignored rather than rejected: providers add
    // fields over time and we only ever trust the ones we understand.
  }

  if (timestampSeconds === undefined) {
    throw new MalformedSignatureHeaderError('Signature header is missing the "t" timestamp');
  }
  if (signatures.length === 0) {
    throw new MalformedSignatureHeaderError('Signature header is missing a "v1" signature');
  }

  return { timestampSeconds, signatures };
}

/** Compute the expected lowercase hex digest for a raw payload. */
export function computeSignature(secret: string, timestampSeconds: number, rawBody: Buffer | string): string {
  return createHmac('sha256', secret)
    .update(`${timestampSeconds}.`)
    .update(rawBody)
    .digest('hex');
}

/** Constant-time comparison of two hex digests. Returns `false` (never throws) on mismatch. */
export function timingSafeEqualHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) {
    // Still perform a comparison so the failure path costs roughly the same.
    timingSafeEqual(leftBuffer, leftBuffer);
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function isTimestampWithinTolerance(
  timestampSeconds: number,
  toleranceSeconds: number,
  nowMs: number = Date.now(),
): boolean {
  const nowSeconds = Math.floor(nowMs / 1_000);
  return Math.abs(nowSeconds - timestampSeconds) <= toleranceSeconds;
}
