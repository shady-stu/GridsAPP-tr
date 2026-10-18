import { createHmac, timingSafeEqual } from "node:crypto";

/** Identity established by server configuration, never copied from request JSON. */
export type Principal = { id: string; role: "admin" | "customer" };

/** Compare equal-length credentials without data-dependent early exits. */
export function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Sign the timestamp prefix and exact wire body using the documented HMAC format. */
export function signWebhook(
  secret: string,
  timestamp: string,
  rawBody: string | Buffer,
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest("hex");
}
