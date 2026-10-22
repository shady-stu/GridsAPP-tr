import type { FastifyInstance } from "fastify";

/** Retain the exact JSON bytes so webhook HMAC checks match the sender's signature input. */
export function registerRawJsonParser(app: FastifyInstance): void {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (request, body, done) => {
      const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(body);
      request.rawBody = rawBody;
      try {
        done(null, JSON.parse(rawBody.toString("utf8")) as unknown);
      } catch {
        done(new Error("Invalid JSON body"));
      }
    },
  );
}
