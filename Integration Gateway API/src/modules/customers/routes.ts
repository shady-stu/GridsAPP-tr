import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  addApiRoute,
  failure,
  parse,
  requirePrincipal,
  sendFailure,
} from "../../lib/http.js";
import type { Db } from "../../database.js";
import { serializeCustomer } from "./serializers.js";
import {
  customerIdParamsSchema,
  customerInputSchema,
  customerListQuerySchema,
  customerPatchSchema,
} from "./schemas.js";

export interface CustomerRoutesOptions {
  db: Db;
  now?: () => string;
}

function isDuplicateEmail(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("UNIQUE constraint failed: customers.email")
  );
}

/** Register customer endpoints; every SQL query applies the principal's ownership scope. */
export function registerCustomerRoutes(
  app: FastifyInstance,
  { db, now = () => new Date().toISOString() }: CustomerRoutesOptions,
): void {
  addApiRoute(
    app,
    "get",
    "/api/v1/customers",
    "List customers",
    "Customers",
    async (request, reply) => {
      const principal = requirePrincipal(request, reply);
      if (!principal) return;
      const query = parse(request, customerListQuerySchema, request.query);
      if ("response" in query) return sendFailure(reply, query.response);
      const { limit, offset, sort, order, q } = query.value;
      const column = (
        { createdAt: "created_at", name: "name", email: "email" } as const
      )[sort];
      const rows = db
        .prepare(
          `SELECT * FROM customers WHERE (? = 'admin' OR owner_id = ?) AND (? IS NULL OR name LIKE ? OR email LIKE ?) ORDER BY ${column} ${order.toUpperCase()} LIMIT ? OFFSET ?`,
        )
        .all(
          principal.role,
          principal.id,
          q ?? null,
          q ? `%${q}%` : null,
          q ? `%${q}%` : null,
          limit,
          offset,
        );
      const total = db
        .prepare(
          "SELECT COUNT(*) AS count FROM customers WHERE (? = 'admin' OR owner_id = ?) AND (? IS NULL OR name LIKE ? OR email LIKE ?)",
        )
        .get(
          principal.role,
          principal.id,
          q ?? null,
          q ? `%${q}%` : null,
          q ? `%${q}%` : null,
        ) as { count: number };
      return reply.send({
        data: rows.map((row) =>
          serializeCustomer(row as Record<string, unknown>),
        ),
        meta: { limit, offset, total: total.count },
      });
    },
    {
      security: [{ bearerAuth: [] }],
      querystring: {
        type: "object",
        properties: {
          limit: { type: "integer", default: 20 },
          offset: { type: "integer", default: 0 },
          q: { type: "string" },
          sort: { type: "string", enum: ["createdAt", "name", "email"] },
          order: { type: "string", enum: ["asc", "desc"] },
        },
      },
    },
  );

  addApiRoute(
    app,
    "get",
    "/api/v1/customers/:id",
    "Get customer",
    "Customers",
    async (request, reply) => {
      const principal = requirePrincipal(request, reply);
      if (!principal) return;
      const params = parse(request, customerIdParamsSchema, request.params);
      if ("response" in params) return sendFailure(reply, params.response);
      const row = db
        .prepare(
          "SELECT * FROM customers WHERE id = ? AND (? = 'admin' OR owner_id = ?)",
        )
        .get(params.value.id, principal.role, principal.id);
      if (!row)
        return sendFailure(
          reply,
          failure(request, 404, "NOT_FOUND", "Customer not found"),
        );
      return reply.send({
        data: serializeCustomer(row as Record<string, unknown>),
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
    "/api/v1/customers",
    "Create customer",
    "Customers",
    async (request, reply) => {
      const principal = requirePrincipal(request, reply);
      if (!principal) return;
      const body = parse(request, customerInputSchema, request.body);
      if ("response" in body) return sendFailure(reply, body.response);
      const id = randomUUID();
      const createdAt = now();
      try {
        db.prepare(
          "INSERT INTO customers(id,owner_id,name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)",
        ).run(
          id,
          principal.id,
          body.value.name,
          body.value.email,
          createdAt,
          createdAt,
        );
      } catch (error) {
        if (!isDuplicateEmail(error)) throw error;
        return sendFailure(
          reply,
          failure(
            request,
            409,
            "CONFLICT",
            "A customer with this email already exists",
          ),
        );
      }
      const row = db
        .prepare("SELECT * FROM customers WHERE id = ?")
        .get(id) as Record<string, unknown>;
      return reply.code(201).send({ data: serializeCustomer(row) });
    },
    {
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["name", "email"],
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          email: { type: "string", format: "email" },
        },
      },
    },
  );

  addApiRoute(
    app,
    "patch",
    "/api/v1/customers/:id",
    "Update customer",
    "Customers",
    async (request, reply) => {
      const principal = requirePrincipal(request, reply);
      if (!principal) return;
      const params = parse(request, customerIdParamsSchema, request.params);
      if ("response" in params) return sendFailure(reply, params.response);
      const body = parse(request, customerPatchSchema, request.body);
      if ("response" in body) return sendFailure(reply, body.response);
      const owned = db
        .prepare(
          "SELECT id FROM customers WHERE id=? AND (?='admin' OR owner_id=?)",
        )
        .get(params.value.id, principal.role, principal.id);
      if (!owned)
        return sendFailure(
          reply,
          failure(request, 404, "NOT_FOUND", "Customer not found"),
        );
      try {
        db.prepare(
          "UPDATE customers SET name=COALESCE(?,name),email=COALESCE(?,email),updated_at=? WHERE id=?",
        ).run(
          body.value.name ?? null,
          body.value.email ?? null,
          now(),
          params.value.id,
        );
      } catch (error) {
        if (!isDuplicateEmail(error)) throw error;
        return sendFailure(
          reply,
          failure(
            request,
            409,
            "CONFLICT",
            "A customer with this email already exists",
          ),
        );
      }
      const row = db
        .prepare("SELECT * FROM customers WHERE id=?")
        .get(params.value.id) as Record<string, unknown>;
      return reply.send({ data: serializeCustomer(row) });
    },
    { security: [{ bearerAuth: [] }] },
  );

  addApiRoute(
    app,
    "delete",
    "/api/v1/customers/:id",
    "Delete customer",
    "Customers",
    async (request, reply) => {
      const principal = requirePrincipal(request, reply, ["admin"]);
      if (!principal) return;
      const params = parse(request, customerIdParamsSchema, request.params);
      if ("response" in params) return sendFailure(reply, params.response);
      const exists = db
        .prepare("SELECT id FROM customers WHERE id=?")
        .get(params.value.id);
      if (!exists)
        return sendFailure(
          reply,
          failure(request, 404, "NOT_FOUND", "Customer not found"),
        );
      // Removing child orders in the same transaction keeps the foreign-key invariant intact.
      db.transaction(() => {
        db.prepare("DELETE FROM orders WHERE customer_id=?").run(
          params.value.id,
        );
        db.prepare("DELETE FROM customers WHERE id=?").run(params.value.id);
      })();
      return reply.code(204).send();
    },
    { security: [{ bearerAuth: [] }] },
  );
}
