import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTable, type Column } from "./DataTable";

describe("DataTable", () => {
  it("renders typed rows and its empty state", () => {
    const rows = [{ id: "c1", name: "Ada" }];
    const columns: Column<(typeof rows)[number]>[] = [
      { key: "name", header: "Name", render: (row) => row.name },
    ];
    const { rerender } = render(
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        emptyMessage="Nothing here"
        label="People"
      />,
    );
    expect(screen.getByRole("table", { name: "People" })).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    rerender(
      <DataTable
        rows={[]}
        columns={columns}
        rowKey={(row) => row.id}
        emptyMessage="Nothing here"
        label="People"
      />,
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });
});
