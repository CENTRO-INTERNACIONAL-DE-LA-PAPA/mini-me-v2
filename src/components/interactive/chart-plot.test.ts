import { describe, expect, it } from "vitest";
import type { ChartData } from "./chart-model";
import { type ChartColours, chartSpec } from "./chart-plot";

const colours: ChartColours = {
  first: "#000",
  palette: [],
  negative: "#888",
  card: "#fff",
  grid: "#eee",
  axis: "#333",
  muted: "#666",
};

function tipLines(chart: ChartData, row: unknown) {
  return chartSpec(chart, 0, [], colours, 600).tips[0].lines(row as never);
}

describe("chart tooltips", () => {
  it("label a count bar chart's bars as rows, even with a y column", () => {
    const bar = { x: "Yungay", y: 3 };
    const chart: ChartData = {
      title: "Plots by variety",
      views: [
        {
          type: "bar",
          x: { name: "variety", type: "text" },
          y: { name: "yield", type: "number" },
          aggregate: "count",
          bars: [bar],
        },
      ],
    };
    expect(tipLines(chart, bar)).toEqual([
      ["variety", "Yungay"],
      ["Rows", "3"],
    ]);
  });

  it("show a date on its own day in any time zone", () => {
    const chart: ChartData = {
      title: "Harvests",
      views: [
        {
          type: "histogram",
          x: { name: "harvest", type: "date" },
          bins: [{ x0: "2024-03-01", x1: "2024-03-08", count: 2 }],
        },
      ],
    };
    const spec = chartSpec(chart, 0, [], colours, 600);
    const [[, range]] = spec.tips[0].lines(spec.tips[0].data[0] as never);
    const day = (d: number) => new Date(2024, 2, d).toLocaleDateString();
    expect(range).toBe(`${day(1)} – ${day(8)}`);
  });
});
