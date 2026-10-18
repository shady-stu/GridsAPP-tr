/**
 * Webhook signature verification (HMAC-SHA256).
 *
 * The signature is computed over the **raw request bytes**, never over a re-serialised object:
 * `JSON.stringify(JSON.parse(x)) !== x` in general (key order, unicode escaping, whitespace), so
 * a parsed body cannot be used to verify a signature. Nest is therefore configured with
 * `rawBody: true` (see `main.ts`) and the controller passes `request.rawBody` through.
 *
 * Header format:
 * ```
 * x-webhook-signature: t=1735689600,v1=<64 hex chars>
 * ```
 *
 * Checks performed, in order — each failure is a distinct, documented error code:
 *  1. the header is present and well-formed            -> 401 `INVALID_SIGNATURE`
 *  2. the timestamp is inside the tolerance window     -> 400 `STALE_WEBHOOK_EVENT`
 *  3. at least one `v1` digest matches (constant time) -> 401 `INVALID_SIGNATURE`
 *
 * The timestamp check is what stops a captured request from being replayed forever; the digest
 * check is what stops a forged request. Both are required.
 */
import { Injectable } from '@nestjs/common';
import { InvalidSignatureError, StaleWebhookEventError } from '../common/errors/domain-error.js';
import {
  computeSignature,
  isTimestampWithinTolerance,
  parseSignatureHeader,
  timingSafeEqualHex,
} from '../common/utils/hmac.util.js';
import type { TypedConfigService } from '../config/configuration.js';

@Injectable()
export class WebhookSignatureService {
  constructor(private readonly config: TypedConfigService) {}

  /**
   * Throws a `DomainError` when verification fails. A void return means "verified".
   * Errors deliberately carry no detail about *which* part failed beyond the header-level
   * distinction, so a caller cannot use response differences to tune an attack.
   */
  verify(rawBody: Buffer | undefined, signatureHeader: string | string[] | undefined): void {
    if (!rawBody || rawBody.length === 0) {
      throw new InvalidSignatureError(
        'The raw request body is required to verify a webhook signature',
      );
    }

    const header = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    if (!header) {
      throw new InvalidSignatureError('Missing x-webhook-signature header');
    }

    let parsed;
    try {
      parsed = parseSignatureHeader(header);
    } catch (error) {
      // A malformed header is an authentication failure, not a validation failure: we cannot
      // trust the caller at all.
      throw new InvalidSignatureError('Malformed x-webhook-signature header', { cause: error });
    }

    const toleranceSeconds = this.config.get('webhooks.signatureToleranceSeconds', { infer: true });
    if (!isTimestampWithinTolerance(parsed.timestampSeconds, toleranceSeconds)) {
      throw new StaleWebhookEventError();
    }

    const secret = this.config.get('webhooks.secret', { infer: true });
    const expected = computeSignature(secret, parsed.timestampSeconds, rawBody);

    // Providers rotate secrets, so several `v1` digests may be present; any match is accepted.
    // `timingSafeEqualHex` never short-circuits on the first differing byte.
    const matched = parsed.signatures.some((candidate) => timingSafeEqualHex(candidate, expected));
    if (!matched) {
      throw new InvalidSignatureError();
    }
  }
}
