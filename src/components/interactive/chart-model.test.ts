import { describe, expect, it } from "vitest";
import { parseChart } from "./chart-model";

function channel(name: string, column: string) {
  return { name, column, value: null };
}

function mark(name: string, dataset: string | null, ...channels: [string, string][]) {
  return {
    mark: name,
    dataset,
    values: [],
    channels: channels.map(([c, column]) => channel(c, column)),
    options: [],
  };
}

describe("chart version 2", () => {
  it("reads rows as objects, dates as UTC days, and refuses data with no mark", () => {
    const harvest = parseChart({
      title: "",
      description: { title: "", height: null, marks: [mark("dot", "d")], scales: [] },
      datasets: { d: { columns: [{ name: "day", type: "date" }], rows: [["2024-03-01"]] } },
    });
    expect(harvest.datasets.d.rows[0].day).toEqual(new Date("2024-03-01T00:00:00Z"));
    expect(() => parseChart({ title: "x", description: { marks: [] }, datasets: {} })).toThrow();
    expect(() => parseChart(null)).toThrow();
  });
});
