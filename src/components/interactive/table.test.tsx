import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TableView, sortRows, tableText } from "./table";

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

describe("table version 1", () => {
  it("sorts numbers with missing values last both ways, and text naturally ignoring case", () => {
    const first = (rows: unknown[][]) => rows.map((row) => row[0]);
    const byYield = (desc: boolean) => first(sortRows(data.rows, true, { column: 1, desc }));
    expect(byYield(false)).toEqual(["a", "c", "b"]);
    expect(byYield(true)).toEqual(["c", "a", "b"]);
    const plots = [["plot 10"], ["plot 2"], ["Plot 1"]];
    const byName = first(sortRows(plots, false, { column: 0, desc: false }));
    expect(byName).toEqual(["Plot 1", "plot 2", "plot 10"]);
  });

  it("right-aligns numbers and leaves missing cells empty", () => {
    const html = renderToStaticMarkup(<TableView preview={data} />);
    expect(html).toContain('text-right">1,200.5</td>');
    expect(html).toContain('text-right"></td>');
  });

  it("says when it shows a preview of a larger table, opening its source file in a Project", () => {
    const preview = { ...data, total_rows: 12340, source: "trial-cleaned.csv" };
    const html = renderToStaticMarkup(<TableView preview={preview} />);
    expect(html).toContain("Showing 3 of 12,340 rows");
    expect(html).toContain("trial-cleaned.csv");
    expect(html).not.toContain("<button type=\"button\" class=\"cursor-pointer");
    const linked = renderToStaticMarkup(
      <TableView preview={preview} sourceAssetId="a1" projectId="p1" />,
    );
    expect(linked).toContain(">trial-cleaned.csv</button>");
    expect(renderToStaticMarkup(<TableView preview={data} />)).not.toContain("Showing");
  });
});

describe("tableText", () => {
  const columns = [
    { name: "plot", type: "text" as const },
    { name: "yield", type: "number" as const },
  ];
  const rows = [
    ["a, north", 1200.5],
    ['say "hi"\tnow', null],
  ];

  it("writes tab-separated text for a spreadsheet, values as stored", () => {
    expect(tableText(columns, rows, "tsv")).toBe('plot\tyield\na, north\t1200.5\nsay "hi" now\t');
  });

  it("quotes CSV fields that need it", () => {
    expect(tableText(columns, rows, "csv")).toBe(
      'plot,yield\r\n"a, north",1200.5\r\n"say ""hi""\tnow",',
    );
  });
});
