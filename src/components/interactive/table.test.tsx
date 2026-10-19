import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TableView } from "./table";

const data = {
  columns: [
    { name: "plot", type: "text" },
    { name: "yield", type: "number" },
  ],
  rows: [
    ["a", 30],
    ["b", null],
    ["c", 1200.5],
  ],
};

function bodyOrder(html: string): string[] {
  return [...html.matchAll(/<tr class="border-b[^"]*"><td[^>]*>([^<]*)</g)].map((m) => m[1]);
}

describe("table version 1", () => {
  it("sorts numbers with missing values last, both ways", () => {
    const sorted = (desc: boolean) =>
      renderToStaticMarkup(<TableView data={data} initialSorting={{ column: 1, desc }} />);
    const [up, down] = [sorted(false), sorted(true)];
    expect(bodyOrder(up)).toEqual(["a", "c", "b"]);
    expect(bodyOrder(down)).toEqual(["c", "a", "b"]);
  });

  it("sorts text in natural order, ignoring case", () => {
    const plots = {
      columns: [{ name: "plot", type: "text" }],
      rows: [["plot 10"], ["plot 2"], ["Plot 1"]],
    };
    const html = renderToStaticMarkup(
      <TableView data={plots} initialSorting={{ column: 0, desc: false }} />,
    );
    expect(bodyOrder(html)).toEqual(["Plot 1", "plot 2", "plot 10"]);
  });

  it("right-aligns numbers and leaves missing cells empty", () => {
    const html = renderToStaticMarkup(<TableView data={data} />);
    expect(html).toContain('text-right">1,200.5</td>');
    expect(html).toContain('text-right"></td>');
  });

  it("says when it shows a preview of a larger table", () => {
    const preview = { ...data, total_rows: 12340, source: "trial-cleaned.csv" };
    const html = renderToStaticMarkup(<TableView data={preview} />);
    expect(html).toContain("Showing 3 of 12,340 rows");
    expect(html).toContain("trial-cleaned.csv");
    expect(renderToStaticMarkup(<TableView data={data} />)).not.toContain("Showing");
  });
});
