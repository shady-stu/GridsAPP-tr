import type { FastifyInstance } from "fastify";
import type { Config } from "../../config.js";
import type { Db } from "../../database.js";
import { failure, parse, sendFailure, addApiRoute } from "../../lib/http.js";
import { constantTimeEqual, signWebhook } from "../../security.js";
import { paymentStatusEventSchema } from "./schemas.js";

export interface WebhookRoutesOptions {
  db: Db;
  config: Config;
  now?: () => string;
  epoch?: () => number;
}

/** Register payment event intake; signature verification happens before event parsing or storage. */
export function registerWebhookRoutes(
  app: FastifyInstance,
  {
    db,
    config,
    now = () => new Date().toISOString(),
    epoch = Date.now,
  }: WebhookRoutesOptions,
): void {
  addApiRoute(
    app,
    "post",
    "/api/v1/webhooks/payments",
    "Receive signed payment status event",
    "Webhooks",
    async (request, reply) => {
      const timestamp = request.headers["x-webhook-timestamp"];
      const signatureHeader = request.headers["x-webhook-signature"];
      if (
        typeof timestamp !== "string" ||
        !/^\d{10}$/.test(timestamp) ||
        typeof signatureHeader !== "string"
      ) {
        return sendFailure(
          reply,
          failure(
            request,
            401,
            "INVALID_SIGNATURE",
            "Webhook signature headers are invalid",
          ),
        );
      }
      const ageSeconds = Math.abs(
        Math.floor(epoch() / 1000) - Number(timestamp),
      );
      if (ageSeconds > config.WEBHOOK_TOLERANCE_SECONDS) {
        return sendFailure(
          reply,
          failure(
            request,
            401,
            "EXPIRED_WEBHOOK",
            "Webhook timestamp is outside the accepted window",
          ),
        );
      }

      const signature = /^sha256=([a-f0-9]{64})$/.exec(signatureHeader);
      const rawBody = request.rawBody;
      // Verify the bytes received, not JSON parsed and reserialized by a framework.
      if (
        !signature ||
        !rawBody ||
        !constantTimeEqual(
          signature[1]!,
          signWebhook(config.WEBHOOK_SECRET, timestamp, rawBody),
        )
      ) {
        return sendFailure(
          reply,
          failure(
            request,
            401,
            "INVALID_SIGNATURE",
            "Webhook signature verification failed",
          ),
        );
      }

      const parsed = parse(request, paymentStatusEventSchema, request.body);
      if ("response" in parsed) return sendFailure(reply, parsed.response);
      try {
        const result = db
          .prepare(
            "INSERT OR IGNORE INTO webhook_events(event_id,payload_json,status,attempts,next_attempt_at,received_at) VALUES(?,?,'pending',0,?,?)",
          )
          .run(parsed.value.id, rawBody.toString("utf8"), epoch(), now());
        if (!result.changes)
          return reply
            .code(200)
            .send({ data: { received: true, duplicate: true } });
        // Acknowledge only after SQLite has persisted the event row.
        return reply
          .code(202)
          .send({ data: { received: true, duplicate: false } });
      } catch (error) {
        request.log.error(
          { err: error, requestId: request.id },
          "webhook persistence failed",
        );
        return sendFailure(
          reply,
          failure(
            request,
            500,
            "INTERNAL_ERROR",
            "Unable to persist webhook event",
          ),
        );
      }
    },
    {
      headers: {
        type: "object",
        required: ["x-webhook-timestamp", "x-webhook-signature"],
        properties: {
          "x-webhook-timestamp": {
            type: "string",
            description: "10-digit Unix seconds",
          },
          "x-webhook-signature": {
            type: "string",
            description: "sha256=<64 lowercase hexadecimal characters>",
          },
        },
      },
      body: {
        type: "object",
        required: ["id", "type", "data"],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1, maxLength: 200 },
          type: { const: "payment.status_changed" },
          data: {
            type: "object",
            required: ["orderId", "status"],
            additionalProperties: false,
            properties: {
              orderId: { type: "string", format: "uuid" },
              status: {
                type: "string",
                enum: ["pending", "paid", "cancelled", "refunded"],
              },
            },
          },
        },
      },
    },
  );
}
