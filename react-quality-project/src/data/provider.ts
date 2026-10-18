import {
  dashboardDataSchema,
  type CreateOrderInput,
  type DashboardData,
  type Order,
} from "../domain/schemas";

/** Provider operations return a typed result so expected failures stay explicit. */
export type Result<T> =
  { success: true; data: T } | { success: false; error: { message: string } };

export interface DashboardProvider {
  loadDashboard(): Promise<Result<DashboardData>>;
  createOrder(input: CreateOrderInput): Promise<Result<Order>>;
}

const demoPayload: unknown = {
  customers: [
    {
      id: "cus-01",
      name: "Olivia Rhye",
      email: "olivia@acme.com",
      company: "Acme Inc.",
      joinedAt: "2025-10-01T09:00:00.000Z",
    },
    {
      id: "cus-02",
      name: "Phoenix Baker",
      email: "phoenix@linear.com",
      company: "Linear",
      joinedAt: "2025-10-04T09:00:00.000Z",
    },
    {
      id: "cus-03",
      name: "Lana Steiner",
      email: "lana@circooles.com",
      company: "Circooles",
      joinedAt: "2025-10-08T09:00:00.000Z",
    },
    {
      id: "cus-04",
      name: "Demi Wilkinson",
      email: "demi@catalog.com",
      company: "Catalog",
      joinedAt: "2025-10-11T09:00:00.000Z",
    },
    {
      id: "cus-05",
      name: "Candice Wu",
      email: "candice@command.com",
      company: "Command+R",
      joinedAt: "2025-10-12T09:00:00.000Z",
    },
  ],
  orders: [
    {
      id: "ORD-2048",
      customerId: "cus-01",
      description: "Website redesign",
      amount: 2400,
      status: "completed",
      createdAt: "2025-10-12T10:15:00.000Z",
    },
    {
      id: "ORD-2047",
      customerId: "cus-02",
      description: "Annual subscription",
      amount: 1200,
      status: "processing",
      createdAt: "2025-10-12T09:10:00.000Z",
    },
    {
      id: "ORD-2046",
      customerId: "cus-03",
      description: "Brand identity package",
      amount: 3600,
      status: "shipped",
      createdAt: "2025-10-11T14:00:00.000Z",
    },
    {
      id: "ORD-2045",
      customerId: "cus-04",
      description: "Product photography",
      amount: 850,
      status: "completed",
      createdAt: "2025-10-10T11:30:00.000Z",
    },
    {
      id: "ORD-2044",
      customerId: "cus-05",
      description: "Team workspace",
      amount: 640,
      status: "processing",
      createdAt: "2025-10-09T08:45:00.000Z",
    },
    {
      id: "ORD-2043",
      customerId: "cus-01",
      description: "Support renewal",
      amount: 480,
      status: "completed",
      createdAt: "2025-10-08T16:20:00.000Z",
    },
  ],
  activity: [
    {
      id: "act-1",
      kind: "order_created",
      message: "Olivia placed order ORD-2048",
      createdAt: "2025-10-12T10:15:00.000Z",
    },
    {
      id: "act-2",
      kind: "order_completed",
      message: "Order ORD-2045 was completed",
      createdAt: "2025-10-10T11:30:00.000Z",
    },
    {
      id: "act-3",
      kind: "customer_added",
      message: "Candice Wu joined your customers",
      createdAt: "2025-10-09T08:00:00.000Z",
    },
  ],
};

/** Validates unknown provider data before the UI can consume it. */
export function parseDashboardPayload(payload: unknown): Result<DashboardData> {
  const parsed = dashboardDataSchema.safeParse(payload);
  return parsed.success
    ? { success: true, data: parsed.data }
    : {
        success: false,
        error: { message: "Dashboard data could not be validated." },
      };
}

/** In-memory demo adapter; replace this implementation with HTTP calls when an API exists. */
export function createDemoProvider(
  initialPayload: unknown = demoPayload,
): DashboardProvider {
  let snapshot = initialPayload;

  return {
    async loadDashboard() {
      await new Promise((resolve) => window.setTimeout(resolve, 160));
      return parseDashboardPayload(snapshot);
    },
    async createOrder(input) {
      const current = parseDashboardPayload(snapshot);
      if (!current.success) return current;
      if (
        !current.data.customers.some(
          (customer) => customer.id === input.customerId,
        )
      ) {
        return {
          success: false,
          error: { message: "That customer could not be found." },
        };
      }
      const order: Order = {
        id: `ORD-${String(Date.now()).slice(-6)}`,
        ...input,
        status: "processing",
        createdAt: new Date().toISOString(),
      };
      snapshot = {
        ...current.data,
        orders: [order, ...current.data.orders],
        activity: [
          {
            id: `act-${order.id}`,
            kind: "order_created",
            message: `New order ${order.id} was created`,
            createdAt: order.createdAt,
          },
          ...current.data.activity,
        ],
      };
      return { success: true, data: order };
    },
  };
}
