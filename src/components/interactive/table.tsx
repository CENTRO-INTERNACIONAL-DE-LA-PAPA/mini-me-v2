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

/** Which column the rows are sorted by, and in which direction. */
export interface Sorting {
  column: number;
  desc: boolean;
}

// Natural order for text: "plot 2" before "plot 10", ignoring case and accents.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** The rows sorted by `sorting`; missing values stay last in both directions. */
export function sortRows(rows: Cell[][], numeric: boolean, sorting: Sorting | null): Cell[][] {
  if (!sorting) return rows;
  const { column, desc } = sorting;
  const compare = (a: Cell, b: Cell) =>
    numeric ? Number(a) - Number(b) : collator.compare(String(a), String(b));
  return [...rows].sort((left, right) => {
    const [a, b] = [left[column] ?? null, right[column] ?? null];
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    return desc ? compare(b, a) : compare(a, b);
  });
}

/** The sort after clicking a column's header: numbers start descending and text ascending,
 * then the direction flips, then the rows go back to their original order. */
function nextSorting(current: Sorting | null, column: number, numeric: boolean): Sorting | null {
  if (current?.column !== column) return { column, desc: numeric };
  if (current.desc === numeric) return { column, desc: !numeric };
  return null;
}

/** The table with an optional starting sort; the catalogue's renderer starts unsorted. */
export function TableView({
  data,
  initialSorting = null,
}: {
  data: unknown;
  initialSorting?: Sorting | null;
}) {
  const { columns, rows, title, total_rows, source } = data as TableData;
  const [sorting, setSorting] = useState<Sorting | null>(initialSorting);
  const sorted = useMemo(
    () => sortRows(rows, columns[sorting?.column ?? 0]?.type === "number", sorting),
    [rows, columns, sorting],
  );

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
            <tr>
              {columns.map((column, index) => {
                const numeric = column.type === "number";
                const direction = sorting?.column === index ? sorting.desc : null;
                return (
                  <th
                    key={index}
                    scope="col"
                    aria-sort={
                      direction === null ? "none" : direction ? "descending" : "ascending"
                    }
                    className="border-b border-border p-0 text-meta font-medium whitespace-nowrap text-muted-foreground"
                  >
                    <button
                      type="button"
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-1 px-3 py-2 transition-colors duration-150 ease-out hover:text-foreground",
                        numeric && "justify-end",
                      )}
                      onClick={() => setSorting((current) => nextSorting(current, index, numeric))}
                    >
                      {column.name}
                      {direction === false && <ArrowUp aria-hidden className="size-3.5" />}
                      {direction === true && <ArrowDown aria-hidden className="size-3.5" />}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border last:border-b-0">
                {columns.map((column, index) => (
                  <td
                    key={index}
                    className={cn(
                      "px-3 py-1.5 whitespace-nowrap text-ink-2",
                      column.type === "number" && "text-right",
                    )}
                  >
                    {display(row[index] ?? null)}
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
