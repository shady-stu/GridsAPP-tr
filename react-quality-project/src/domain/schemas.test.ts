import { describe, expect, it } from "vitest";
import { createOrderInputSchema, dashboardDataSchema } from "./schemas";

describe("runtime schemas", () => {
  it("accepts valid order form values and coerces the amount", () => {
    expect(
      createOrderInputSchema.parse({
        customerId: "cus-1",
        description: "Design work",
        amount: "25",
      }).amount,
    ).toBe(25);
  });

  it("rejects malformed dashboard payloads", () => {
    expect(
      dashboardDataSchema.safeParse({
        customers: [],
        orders: [{ id: "bad" }],
        activity: [],
      }).success,
    ).toBe(false);
  });

  it("rejects zero order amounts", () => {
    expect(
      createOrderInputSchema.safeParse({
        customerId: "cus-1",
        description: "Design work",
        amount: "0",
      }).success,
    ).toBe(false);
  });
});
