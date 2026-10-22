import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  emptyMessage: string;
  label: string;
}

/** Generic accessible table; row and cell renderers remain specific to each domain type. */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  emptyMessage,
  label,
}: DataTableProps<T>) {
  return (
    <div className="table-scroll">
      <table aria-label={label}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th className={column.className} key={column.key} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="empty-cell" colSpan={columns.length}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td className={column.className} key={column.key}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
