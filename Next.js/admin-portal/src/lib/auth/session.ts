import { createHmac, timingSafeEqual } from "node:crypto";

export type SignedSession = { sub: string; exp: number };

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createSignedSession(subject: string, expiresAt: number, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: subject, exp: expiresAt } satisfies SignedSession)).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySignedSession(token: string, secret: string, now?: number): SignedSession | null {
  try {
    const [payload, providedSignature, extra] = token.split(".");
    if (!payload || !providedSignature || extra !== undefined || !safeEqual(providedSignature, sign(payload, secret))) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<SignedSession>;
    const currentTime = now ?? Math.floor(Date.now() / 1000);
    if (typeof session.sub !== "string" || typeof session.exp !== "number" || !Number.isInteger(session.exp) || session.exp <= currentTime) return null;
    return { sub: session.sub, exp: session.exp };
  } catch {
    return null;
  }
}
