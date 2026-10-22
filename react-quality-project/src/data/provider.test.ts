import { describe, expect, it } from "vitest";
import { createDemoProvider, parseDashboardPayload } from "./provider";

describe("dashboard provider boundary", () => {
  it("returns a typed error for invalid external data", () => {
    expect(parseDashboardPayload({ hello: "world" })).toMatchObject({
      success: false,
    });
  });

  it("creates an order and a corresponding activity entry", async () => {
    const provider = createDemoProvider();
    const loaded = await provider.loadDashboard();
    expect(loaded.success).toBe(true);
    const created = await provider.createOrder({
      customerId: "cus-01",
      description: "Extra support",
      amount: 200,
    });
    expect(created.success).toBe(true);
    const updated = await provider.loadDashboard();
    expect(updated.success && updated.data.orders[0]?.id).toBe(
      created.success ? created.data.id : "",
    );
    expect(updated.success && updated.data.activity[0]?.kind).toBe(
      "order_created",
    );
  });
});
