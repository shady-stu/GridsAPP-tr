import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("dashboard", () => {
  it("shows the loading state before demo data arrives", () => {
    render(<App />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading your workspace",
    );
  });

  it("loads customers, orders, and completed revenue", async () => {
    render(<App />);
    expect(await screen.findByText("Recent orders")).toBeInTheDocument();
    expect(screen.getAllByText("ORD-2048")).toHaveLength(1);
    expect(screen.getByText("Completed revenue")).toBeInTheDocument();
  });

  it("filters orders by selected customer", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("ORD-2048");
    await user.selectOptions(
      screen.getAllByRole("combobox", {
        name: "Filter orders by customer",
      })[0]!,
      "cus-02",
    );
    expect(screen.getAllByText("ORD-2047")).toHaveLength(1);
    expect(screen.queryAllByText("ORD-2048")).toHaveLength(0);
  });
});
