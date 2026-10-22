import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp, signWebhook, type BuiltApp } from "../../src/app.js";
import type { Config } from "../../src/config.js";

const now = 1_735_689_600_000;
const env = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 3000,
  DATABASE_PATH: ":memory:",
  ADMIN_API_TOKEN: "a".repeat(32),
  CUSTOMER_API_TOKEN: "c".repeat(32),
  WEBHOOK_SECRET: "w".repeat(32),
  WEBHOOK_TOLERANCE_SECONDS: 300,
  WEBHOOK_MAX_ATTEMPTS: 3,
  RATE_LIMIT_MAX: 1000,
  RATE_LIMIT_WINDOW: "1 minute",
} as Config;
const bearer = (token = env.CUSTOMER_API_TOKEN) => ({
  authorization: `Bearer ${token}`,
});
let app: BuiltApp;
let closedInTest = false;

beforeEach(async () => {
  closedInTest = false;
  app = await buildApp({
    config: env,
    databasePath: ":memory:",
    clock: () => now,
  });
});
afterEach(async () => {
  if (!closedInTest) await app.close();
});

async function customer(
  name = "Ada Lovelace",
  email = `ada-${randomUUID()}@example.test`,
  token = env.CUSTOMER_API_TOKEN,
) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/customers",
    headers: bearer(token),
    payload: { name, email },
  });
  return response.json().data as { id: string; name: string; email: string };
}
async function order(customerId: string, key = `key-${randomUUID()}`) {
  return app.inject({
    method: "POST",
    url: "/api/v1/orders",
    headers: { ...bearer(), "idempotency-key": key },
    payload: { customerId, totalCents: 1200, currency: "USD" },
  });
}
async function webhook(
  payload: unknown,
  timestamp = String(now / 1000),
  alteredSignature?: string,
) {
  const raw = JSON.stringify(payload);
  const signature =
    alteredSignature ??
    `sha256=${signWebhook(env.WEBHOOK_SECRET, timestamp, raw)}`;
  return app.inject({
    method: "POST",
    url: "/api/v1/webhooks/payments",
    headers: {
      "content-type": "application/json",
      "x-webhook-timestamp": timestamp,
      "x-webhook-signature": signature,
    },
    payload: raw,
  });
}

describe("REST API request pipeline", () => {
  it("serves the public health route", async () => {
    const response = await app.inject({ url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { status: "ok" } });
  });

  it("creates a customer", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/customers",
      headers: bearer(),
      payload: {
        name: "Grace Hopper",
        email: `grace-${randomUUID()}@example.test`,
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().data.id).toBeTruthy();
  });
  it("rejects an invalid customer payload with field errors and request ID", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/customers",
      headers: bearer(),
      payload: { name: "", email: "bad" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(response.json().error.fields.email).toBeTruthy();
    expect(response.headers["x-request-id"]).toBeTruthy();
  });
  it("rejects missing authentication", async () => {
    expect((await app.inject({ url: "/api/v1/customers" })).statusCode).toBe(
      401,
    );
  });
  it("does not allow creating an order for another principal's customer", async () => {
    const otherCustomer = await customer(
      "Other principal",
      `other-${randomUUID()}@example.test`,
      env.ADMIN_API_TOKEN,
    );
    const response = await order(otherCustomer.id);
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");
  });
  it("denies a customer role access to the admin-only delete operation", async () => {
    const record = await customer();
    const response = await app.inject({
      method: "DELETE",
      url: `/api/v1/customers/${record.id}`,
      headers: bearer(),
    });
    expect(response.statusCode).toBe(403);
  });
  it("validates pagination and filters customer lists", async () => {
    const record = await customer("Filter Target");
    await customer("Other Customer");
    const response = await app.inject({
      url: "/api/v1/customers?limit=1&offset=0&q=Filter%20Target",
      headers: bearer(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(response.json().meta.total).toBe(1);
    expect(response.json().data[0].id).toBe(record.id);
    expect(
      (
        await app.inject({
          url: "/api/v1/customers?limit=999",
          headers: bearer(),
        })
      ).statusCode,
    ).toBe(400);
  });
  it("supports customer detail, update, admin delete, and missing-resource errors", async () => {
    const record = await customer();
    const detail = await app.inject({
      url: "/api/v1/customers/" + record.id,
      headers: bearer(),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.email).toBe(record.email);

    const updated = await app.inject({
      method: "PATCH",
      url: "/api/v1/customers/" + record.id,
      headers: bearer(),
      payload: { name: "Updated Name" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.name).toBe("Updated Name");

    const other = await customer("Other Customer");
    const conflict = await app.inject({
      method: "PATCH",
      url: "/api/v1/customers/" + record.id,
      headers: bearer(),
      payload: { email: other.email },
    });
    expect(conflict.statusCode).toBe(409);

    const emptyPatch = await app.inject({
      method: "PATCH",
      url: "/api/v1/customers/" + record.id,
      headers: bearer(),
      payload: {},
    });
    expect(emptyPatch.statusCode).toBe(400);

    const deleted = await app.inject({
      method: "DELETE",
      url: "/api/v1/customers/" + record.id,
      headers: bearer(env.ADMIN_API_TOKEN),
    });
    expect(deleted.statusCode).toBe(204);
    const missing = await app.inject({
      url: "/api/v1/customers/" + record.id,
      headers: bearer(),
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.requestId).toBeTruthy();
  });
  it("creates an order for an owned customer", async () => {
    const record = await customer();
    const response = await order(record.id);
    expect(response.statusCode).toBe(201);
    expect(response.json().data.customerId).toBe(record.id);
  });
  it("supports order detail, status update, list filtering, and validation", async () => {
    const record = await customer();
    const created = await order(record.id);
    const id = created.json().data.id as string;
    const detail = await app.inject({
      url: "/api/v1/orders/" + id,
      headers: bearer(),
    });
    expect(detail.statusCode).toBe(200);

    const updated = await app.inject({
      method: "PATCH",
      url: "/api/v1/orders/" + id,
      headers: bearer(),
      payload: { status: "paid" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.status).toBe("paid");
    const filtered = await app.inject({
      url: "/api/v1/orders?status=paid&sort=totalCents",
      headers: bearer(),
    });
    expect(filtered.statusCode).toBe(200);
    expect(filtered.json().data).toHaveLength(1);

    const invalid = await app.inject({
      method: "POST",
      url: "/api/v1/orders",
      headers: { ...bearer(), "idempotency-key": "invalid-order-key" },
      payload: { customerId: record.id, totalCents: 0 },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.fields.totalCents).toBeTruthy();
  });
  it("returns the original order for a repeated idempotency key", async () => {
    const record = await customer();
    const key = `repeat-${randomUUID()}`;
    const first = await order(record.id, key);
    const repeated = await order(record.id, key);
    expect(first.statusCode).toBe(201);
    expect(repeated.statusCode).toBe(201);
    expect(repeated.json().data.id).toBe(first.json().data.id);
    expect(
      app.db.prepare("SELECT COUNT(*) AS n FROM orders").get(),
    ).toMatchObject({ n: 1 });
  });
  it("rejects an idempotency key reused with a different payload", async () => {
    const record = await customer();
    const key = `conflict-${randomUUID()}`;
    await order(record.id, key);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orders",
      headers: { ...bearer(), "idempotency-key": key },
      payload: { customerId: record.id, totalCents: 1300 },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("IDEMPOTENCY_CONFLICT");
  });
  it("accepts a valid raw-body webhook signature and updates an order asynchronously", async () => {
    const record = await customer();
    const created = await order(record.id);
    const id = created.json().data.id;
    const event = {
      id: `evt_${randomUUID()}`,
      type: "payment.status_changed",
      data: { orderId: id, status: "paid" },
    };
    const received = await webhook(event);
    expect(received.statusCode).toBe(202);
    await app.processPendingEvents();
    expect(
      app.db.prepare("SELECT status FROM orders WHERE id=?").get(id),
    ).toMatchObject({ status: "paid" });
  });
  it("verifies signatures against whitespace-preserving raw JSON bytes", async () => {
    const record = await customer();
    const created = await order(record.id);
    const raw =
      '{\n  "id": "evt_raw_' +
      randomUUID() +
      '",\n  "type": "payment.status_changed",\n  "data": { "orderId": "' +
      created.json().data.id +
      '", "status": "paid" }\n}';
    const timestamp = String(now / 1000);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/payments",
      headers: {
        "content-type": "application/json",
        "x-webhook-timestamp": timestamp,
        "x-webhook-signature":
          "sha256=" + signWebhook(env.WEBHOOK_SECRET, timestamp, raw),
      },
      payload: raw,
    });
    expect(response.statusCode).toBe(202);
  });
  it("rejects an invalid webhook signature", async () => {
    const response = await webhook(
      {
        id: "evt_bad",
        type: "payment.status_changed",
        data: { orderId: randomUUID(), status: "paid" },
      },
      undefined,
      `sha256=${"0".repeat(64)}`,
    );
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("INVALID_SIGNATURE");
  });
  it("rejects an expired timestamp", async () => {
    const response = await webhook(
      {
        id: "evt_expired",
        type: "payment.status_changed",
        data: { orderId: randomUUID(), status: "paid" },
      },
      "1735689000",
    );
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("EXPIRED_WEBHOOK");
  });
  it("acknowledges a duplicate event only once", async () => {
    const record = await customer();
    const created = await order(record.id);
    const event = {
      id: `evt_${randomUUID()}`,
      type: "payment.status_changed",
      data: { orderId: created.json().data.id, status: "paid" },
    };
    expect((await webhook(event)).statusCode).toBe(202);
    expect((await webhook(event)).json().data.duplicate).toBe(true);
    expect(
      app.db.prepare("SELECT COUNT(*) AS n FROM webhook_events").get(),
    ).toMatchObject({ n: 1 });
  });
  it("retries a failed event and moves exhausted work to dead letter state", async () => {
    const event = {
      id: `evt_${randomUUID()}`,
      type: "payment.status_changed",
      data: { orderId: randomUUID(), status: "paid" },
    };
    expect((await webhook(event)).statusCode).toBe(202);
    for (let i = 0; i < 3; i += 1) {
      app.db
        .prepare("UPDATE webhook_events SET next_attempt_at=0 WHERE event_id=?")
        .run(event.id);
      await app.processPendingEvents();
    }
    expect(
      app.db
        .prepare("SELECT status,attempts FROM webhook_events WHERE event_id=?")
        .get(event.id),
    ).toMatchObject({ status: "dead_letter", attempts: 3 });
  });
  it("publishes OpenAPI and interactive documentation routes", async () => {
    const specification = await app.inject({ url: "/openapi.json" });
    const docs = await app.inject({ url: "/documentation" });
    expect(specification.statusCode).toBe(200);
    expect(specification.json().paths["/api/v1/customers"]).toBeTruthy();
    expect(
      specification.json().paths["/api/v1/webhooks/payments"],
    ).toBeTruthy();
    expect(docs.statusCode).toBe(200);
  });
  it("closes SQLite and its worker when the application shuts down", async () => {
    expect(app.db.open).toBe(true);
    await app.close();
    closedInTest = true;
    expect(app.db.open).toBe(false);
  });
});
