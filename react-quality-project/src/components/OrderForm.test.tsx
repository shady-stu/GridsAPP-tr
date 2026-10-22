import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OrderForm } from "./OrderForm";
import type { DashboardProvider } from "../data/provider";
import type { CreateOrderInput, Order } from "../domain/schemas";

const customers = [
  {
    id: "c1",
    name: "Ada",
    email: "ada@example.com",
    company: "Analytical",
    joinedAt: "2025-01-01T00:00:00.000Z",
  },
];
const createdOrder: Order = {
  id: "o1",
  customerId: "c1",
  description: "Consulting",
  amount: 50,
  status: "processing",
  createdAt: "2025-01-01T00:00:00.000Z",
};
function providerWith(
  createOrder: DashboardProvider["createOrder"],
): DashboardProvider {
  return {
    loadDashboard: async () => ({
      success: true,
      data: { customers, orders: [], activity: [] },
    }),
    createOrder,
  };
}

describe("OrderForm", () => {
  it("reports validation issues without calling the provider", async () => {
    const user = userEvent.setup();
    const createOrder = vi.fn(async (_input: CreateOrderInput) => ({
      success: true as const,
      data: createdOrder,
    }));
    render(
      <OrderForm
        customers={customers}
        provider={providerWith(createOrder)}
        onCreated={() => undefined}
      />,
    );
    await user.click(
      screen.getAllByRole("button", { name: /create order/i })[0]!,
    );
    expect(await screen.findByText("Choose a customer.")).toBeInTheDocument();
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("reports success only after provider success", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    const createOrder = vi.fn(async (_input: CreateOrderInput) => ({
      success: true as const,
      data: createdOrder,
    }));
    render(
      <OrderForm
        customers={customers}
        provider={providerWith(createOrder)}
        onCreated={onCreated}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Customer"), "c1");
    await user.type(screen.getByLabelText("Order description"), "Consulting");
    await user.type(screen.getByLabelText("Amount"), "50");
    await user.click(
      screen.getAllByRole("button", { name: /create order/i })[0]!,
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(createdOrder));
    expect(
      await screen.findByText("Your order has been created."),
    ).toBeInTheDocument();
  });

  it("shows provider errors without claiming success", async () => {
    const user = userEvent.setup();
    const createOrder = vi.fn(async (_input: CreateOrderInput) => ({
      success: false as const,
      error: { message: "Provider unavailable" },
    }));
    render(
      <OrderForm
        customers={customers}
        provider={providerWith(createOrder)}
        onCreated={() => undefined}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Customer"), "c1");
    await user.type(screen.getByLabelText("Order description"), "Consulting");
    await user.type(screen.getByLabelText("Amount"), "50");
    await user.click(
      screen.getAllByRole("button", { name: /create order/i })[0]!,
    );
    expect(await screen.findByText("Provider unavailable")).toBeInTheDocument();
    expect(
      screen.queryByText("Your order has been created."),
    ).not.toBeInTheDocument();
  });
});
