import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "../../database.js";
import {
  addApiRoute,
  failure,
  parse,
  requirePrincipal,
  sendFailure,
} from "../../lib/http.js";
import { serializeOrder } from "./serializers.js";
import {
  orderIdParamsSchema,
  orderInputSchema,
  orderListQuerySchema,
  orderPatchSchema,
} from "./schemas.js";

export interface OrderRoutesOptions {
  db: Db;
  now?: () => string;
  epoch?: () => number;
}

const payloadFingerprint = (payload: unknown): string =>
  createHash("sha256").update(JSON.stringify(payload)).digest("hex");

/** Register order endpoints with principal-scoped reads and transactional idempotent creation. */
export function registerOrderRoutes(
  app: FastifyInstance,
  {
    db,
    now = () => new Date().toISOString(),
    epoch = Date.now,
  }: OrderRoutesOptions,
): void {
  addApiRoute(
    app,
    "get",
    "/api/v1/orders",
    "List orders",
    "Orders",
    async (request, reply) => {
      const principal = requirePrincipal(request, reply);
      if (!principal) return;
      const query = parse(request, orderListQuerySchema, request.query);
      if ("response" in query) return sendFailure(reply, query.response);
      const { limit, offset, sort, order, status, customerId } = query.value;
      const column = (
        {
          createdAt: "created_at",
          totalCents: "total_cents",
          status: "status",
        } as const
      )[sort];
      const predicate =
        "(?='admin' OR owner_id=?) AND (? IS NULL OR status=?) AND (? IS NULL OR customer_id=?)";
      const rows = db
        .prepare(
          "SELECT * FROM orders WHERE " +
            predicate +
            " ORDER BY " +
            column +
            " " +
            order.toUpperCase() +
            " LIMIT ? OFFSET ?",
        )
        .all(
          principal.role,
          principal.id,
          status ?? null,
          status ?? null,
          customerId ?? null,
          customerId ?? null,
          limit,
          offset,
        );
      const total = db
        .prepare("SELECT COUNT(*) AS count FROM orders WHERE " + predicate)
        .get(
          principal.role,
          principal.id,
          status ?? null,
          status ?? null,
          customerId ?? null,
          customerId ?? null,
        ) as { count: number };
      return reply.send({
        data: rows.map((row) => serializeOrder(row as Record<string, unknown>)),
        meta: { limit, offset, total: total.count },
      });
    },
    {
      security: [{ bearerAuth: [] }],
      querystring: {
        type: "object",
        properties: {
          limit: { type: "integer" },
          offset: { type: "integer" },
          status: {
            type: "string",
            enum: ["pending", "paid", "cancelled", "refunded"],
          },
          customerId: { type: "string", format: "uuid" },
          sort: { type: "string", enum: ["createdAt", "totalCents", "status"] },
          order: { type: "string", enum: ["asc", "desc"] },
        },
      },
    },
  );

  addApiRoute(
    app,
    "get",
    "/api/v1/orders/:id",
    "Get order",
    "Orders",
    async (request, reply) => {
      const principal = requirePrincipal(request, reply);
      if (!principal) return;
      const params = parse(request, orderIdParamsSchema, request.params);
      if ("response" in params) return sendFailure(reply, params.response);
      const row = db
        .prepare(
          "SELECT * FROM orders WHERE id=? AND (?='admin' OR owner_id=?)",
        )
        .get(params.value.id, principal.role, principal.id);
      if (!row)
        return sendFailure(
          reply,
          failure(request, 404, "NOT_FOUND", "Order not found"),
        );
      return reply.send({
        data: serializeOrder(row as Record<string, unknown>),
      });
    },
    {
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string", format: "uuid" } },
      },
    },
  );

  addApiRoute(
    app,
    "post",
    "/api/v1/orders",
    "Create order",
    "Orders",
    async (request, reply) => {
      const principal = requirePrincipal(request, reply);
      if (!principal) return;
      const key = request.headers["idempotency-key"];
      if (typeof key !== "string" || key.length < 8 || key.length > 128) {
        return sendFailure(
          reply,
          failure(
            request,
            400,
            "VALIDATION_ERROR",
            "Idempotency-Key must contain 8 to 128 characters",
          ),
        );
      }
      const body = parse(request, orderInputSchema, request.body);
      if ("response" in body) return sendFailure(reply, body.response);
      // Fingerprint validated, defaulted input, so equivalent accepted payloads share a key.
      const fingerprint = payloadFingerprint(body.value);
      const previous = db
        .prepare("SELECT * FROM idempotency_keys WHERE principal=? AND key=?")
        .get(principal.id, key) as Record<string, unknown> | undefined;
      if (previous)
        return replayOrConflict(request, reply, previous, fingerprint);

      const customer = db
        .prepare(
          "SELECT id FROM customers WHERE id=? AND (?='admin' OR owner_id=?)",
        )
        .get(body.value.customerId, principal.role, principal.id);
      if (!customer)
        return sendFailure(
          reply,
          failure(request, 404, "NOT_FOUND", "Customer not found"),
        );
      const id = randomUUID();
      const timestamp = now();
      const response = {
        data: {
          id,
          customerId: body.value.customerId,
          status: "pending",
          totalCents: body.value.totalCents,
          currency: body.value.currency,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      };

      try {
        // The order and replay response commit atomically; a crash cannot leave only one persisted.
        db.transaction(() => {
          db.prepare("INSERT INTO orders VALUES(?,?,?,?,?,?,?,?)").run(
            id,
            body.value.customerId,
            principal.id,
            "pending",
            body.value.totalCents,
            body.value.currency,
            timestamp,
            timestamp,
          );
          db.prepare("INSERT INTO idempotency_keys VALUES(?,?,?,?,?,?)").run(
            principal.id,
            key,
            fingerprint,
            JSON.stringify(response),
            201,
            epoch(),
          );
        })();
      } catch (error) {
        // A competing request may have won the unique (principal, key) insert.
        const raced = db
          .prepare("SELECT * FROM idempotency_keys WHERE principal=? AND key=?")
          .get(principal.id, key) as Record<string, unknown> | undefined;
        if (raced) return replayOrConflict(request, reply, raced, fingerprint);
        request.log.error(
          { err: error, requestId: request.id },
          "order creation failed",
        );
        throw error;
      }
      return reply.code(201).send(response);
    },
    {
      security: [{ bearerAuth: [] }],
      headers: {
        type: "object",
        required: ["idempotency-key"],
        properties: {
          "idempotency-key": { type: "string", minLength: 8, maxLength: 128 },
        },
      },
      body: {
        type: "object",
        required: ["customerId", "totalCents"],
        additionalProperties: false,
        properties: {
          customerId: { type: "string", format: "uuid" },
          totalCents: { type: "integer", minimum: 1 },
          currency: { type: "string", default: "USD" },
        },
      },
    },
  );

  addApiRoute(
    app,
    "patch",
    "/api/v1/orders/:id",
    "Update order status",
    "Orders",
    async (request, reply) => {
      const principal = requirePrincipal(request, reply);
      if (!principal) return;
      const params = parse(request, orderIdParamsSchema, request.params);
      if ("response" in params) return sendFailure(reply, params.response);
      const body = parse(request, orderPatchSchema, request.body);
      if ("response" in body) return sendFailure(reply, body.response);
      const changed = db
        .prepare(
          "UPDATE orders SET status=?,updated_at=? WHERE id=? AND (?='admin' OR owner_id=?)",
        )
        .run(
          body.value.status,
          now(),
          params.value.id,
          principal.role,
          principal.id,
        );
      if (!changed.changes)
        return sendFailure(
          reply,
          failure(request, 404, "NOT_FOUND", "Order not found"),
        );
      const row = db
        .prepare("SELECT * FROM orders WHERE id=?")
        .get(params.value.id) as Record<string, unknown>;
      return reply.send({ data: serializeOrder(row) });
    },
    { security: [{ bearerAuth: [] }] },
  );
}

function replayOrConflict(
  request: FastifyRequest,
  reply: FastifyReply,
  entry: Record<string, unknown>,
  fingerprint: string,
) {
  if (entry.fingerprint !== fingerprint) {
    return sendFailure(
      reply,
      failure(
        request,
        409,
        "IDEMPOTENCY_CONFLICT",
        "This idempotency key was used with a different payload",
      ),
    );
  }
  return reply
    .code(Number(entry.status_code))
    .send(JSON.parse(String(entry.response_json)) as unknown);
}
