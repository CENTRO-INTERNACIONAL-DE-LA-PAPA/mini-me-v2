import { describe, expect, it } from "vitest";
import { tableText } from "./table";

describe("tableText", () => {
  const columns = [
    { name: "plot", type: "text" as const },
    { name: "yield", type: "number" as const },
  ];
  const rows = [
    ["a, north", 1200.5],
    ['say "hi"\tnow', null],
  ];

  it("quotes CSV fields that need it", () => {
    expect(tableText(columns, rows, "csv")).toBe(
      'plot,yield\r\n"a, north",1200.5\r\n"say ""hi""\tnow",',
    );
    expect(tableText(columns, rows, "tsv")).toBe('plot\tyield\na, north\t1200.5\nsay "hi" now\t');
  });
});
