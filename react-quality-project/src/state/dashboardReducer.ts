import type { Activity, Customer, Order } from "../domain/schemas";

export type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      customers: Customer[];
      orders: Order[];
      activity: Activity[];
    };

export interface DashboardState {
  data: LoadState;
  customerFilter: string;
  notice: string;
}

export type DashboardAction =
  | { type: "load-started" }
  | {
      type: "load-succeeded";
      customers: Customer[];
      orders: Order[];
      activity: Activity[];
    }
  | { type: "load-failed"; message: string }
  | { type: "customer-filter-changed"; customerId: string }
  | { type: "order-created"; order: Order };

export const initialDashboardState: DashboardState = {
  data: { status: "loading" },
  customerFilter: "all",
  notice: "",
};

/** Keeps shared data transitions explicit and makes impossible states visible in types. */
export function dashboardReducer(
  state: DashboardState,
  action: DashboardAction,
): DashboardState {
  switch (action.type) {
    case "load-started":
      return { ...state, data: { status: "loading" }, notice: "" };
    case "load-succeeded":
      return { ...state, data: { status: "ready", ...action }, notice: "" };
    case "load-failed":
      return { ...state, data: { status: "error", message: action.message } };
    case "customer-filter-changed":
      return { ...state, customerFilter: action.customerId };
    case "order-created":
      if (state.data.status !== "ready") return state;
      return {
        ...state,
        data: { ...state.data, orders: [action.order, ...state.data.orders] },
        notice: `Order ${action.order.id} created successfully.`,
      };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
