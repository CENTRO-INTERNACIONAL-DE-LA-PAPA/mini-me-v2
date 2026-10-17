import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Renderers } from "./catalogue";

type Cell = string | number | boolean | null;

/** `table` version 1 data, as the data Traits build it. */
interface TableData {
  columns: { name: string; type: "number" | "text" | "date" | "boolean" }[];
  rows: Cell[][];
  title?: string;
  /** Set when `rows` is a preview of a larger table, held whole in the Asset `source`. */
  total_rows?: number;
  source?: string;
}

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 });

function display(value: Cell): string {
  if (value === null) return "";
  if (typeof value === "number") return numberFormat.format(value);
  return String(value);
}

/** The table with an optional starting sort; the catalogue's renderer starts unsorted. */
export function TableView({
  data,
  initialSorting = [],
}: {
  data: unknown;
  initialSorting?: SortingState;
}) {
  const { columns, rows, title, total_rows, source } = data as TableData;
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const definitions = useMemo<ColumnDef<Cell[]>[]>(
    () =>
      columns.map((column, index) => ({
        id: String(index),
        header: column.name,
        // Missing values become `undefined` so `sortUndefined` keeps them last both ways.
        accessorFn: (row) => row[index] ?? undefined,
        sortUndefined: "last",
        sortingFn: column.type === "number" ? "basic" : "alphanumeric",
        cell: (info) => display(info.row.original[index] ?? null),
        meta: { numeric: column.type === "number" },
      })),
    [columns],
  );
  const table = useReactTable({
    data: rows,
    columns: definitions,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <section
      aria-label={title ?? "Table"}
      className="w-full min-w-0 overflow-hidden rounded-[10px] border border-border bg-card"
    >
      {title && (
        <h3 className="border-b border-border px-4 py-2.5 text-ui font-semibold">{title}</h3>
      )}
      {/* Wide tables scroll sideways inside the card instead of widening the reply. */}
      <div className="max-h-[420px] w-full overflow-auto overscroll-contain">
        <table className="w-max min-w-full border-collapse text-ui tabular-nums">
          <thead className="sticky top-0 bg-muted">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const numeric = (header.column.columnDef.meta as { numeric: boolean }).numeric;
                  const sorted = header.column.getIsSorted();
                  const order = { asc: "ascending", desc: "descending" } as const;
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={sorted ? order[sorted] : "none"}
                      className="border-b border-border p-0 text-meta font-medium whitespace-nowrap text-muted-foreground"
                    >
                      <button
                        type="button"
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-1 px-3 py-2 transition-colors duration-150 ease-out hover:text-foreground",
                          numeric && "justify-end",
                        )}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === "asc" && <ArrowUp aria-hidden className="size-3.5" />}
                        {sorted === "desc" && <ArrowDown aria-hidden className="size-3.5" />}
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-b-0">
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={cn(
                      "px-3 py-1.5 whitespace-nowrap text-ink-2",
                      (cell.column.columnDef.meta as { numeric: boolean }).numeric && "text-right",
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total_rows !== undefined && total_rows > rows.length && (
        <p className="border-t border-border px-4 py-2 text-meta text-muted-foreground">
          Showing {numberFormat.format(rows.length)} of {numberFormat.format(total_rows)} rows
          {source && (
            <>
              ; the full table is in <span className="font-medium text-ink-2">{source}</span>
            </>
          )}
          .
        </p>
      )}
    </section>
  );
}

export const renderers: Renderers = {
  1: ({ data }) => <TableView data={data} />,
};
