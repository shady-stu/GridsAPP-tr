import { describe, expect, it } from "vitest";
import { dashboardReducer, initialDashboardState } from "./dashboardReducer";

const customer = {
  id: "c1",
  name: "Ada",
  email: "ada@example.com",
  company: "Analytical",
  joinedAt: "2025-01-01T00:00:00.000Z",
};
const order = {
  id: "o1",
  customerId: "c1",
  description: "Consulting",
  amount: 50,
  status: "processing" as const,
  createdAt: "2025-01-01T00:00:00.000Z",
};

describe("dashboard reducer", () => {
  it("represents loading errors explicitly", () => {
    expect(
      dashboardReducer(initialDashboardState, {
        type: "load-failed",
        message: "Offline",
      }).data,
    ).toEqual({ status: "error", message: "Offline" });
  });

  it("updates selection and appends successful orders without duplicating activity", () => {
    const ready = dashboardReducer(initialDashboardState, {
      type: "load-succeeded",
      customers: [customer],
      orders: [],
      activity: [],
    });
    const filtered = dashboardReducer(ready, {
      type: "customer-filter-changed",
      customerId: "c1",
    });
    const created = dashboardReducer(filtered, {
      type: "order-created",
      order,
    });
    expect(created.customerFilter).toBe("c1");
    expect(created.data.status === "ready" && created.data.orders).toEqual([
      order,
    ]);
    expect(created.notice).toContain("o1");
  });
});
