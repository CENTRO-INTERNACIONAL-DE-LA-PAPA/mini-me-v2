import { describe, expect, it } from "vitest";
import { type ChartData, chartReducer, initialState, parseChart } from "./chart-model";
import { type ChartColours, chartSpec } from "./chart-plot";

const chart: ChartData = parseChart({
  title: "Yield by treatment",
  views: [
    {
      type: "histogram",
      x: { name: "yield", type: "number" },
      series: ["Control", "Fungicide"],
      series_column: "treatment",
      bins: [
        { x0: 0, x1: 10, count: 3, series: "Control" },
        { x0: 0, x1: 10, count: 5, series: "Fungicide" },
      ],
    },
    {
      type: "box",
      x: { name: "treatment", type: "text" },
      y: { name: "yield", type: "number" },
      groups: [
        { group: "Control", q1: 3, median: 5, q3: 7, low: 1, high: 8, count: 9, outliers: [20] },
      ],
    },
    {
      type: "heatmap",
      columns: ["yield", "height"],
      cells: [{ x: "yield", y: "height", value: 0.6 }],
    },
  ],
});

const colours: ChartColours = {
  first: "#9769DC",
  palette: ["#eb6834", "#1baf7a", "#2a78d6", "#eda100", "#e87ba4", "#008300", "#e34948"],
  negative: "#3d3d3d",
  card: "#ffffff",
  grid: "#f1f0eb",
  axis: "#0a0a0a",
  muted: "#8a8a8a",
};

const reduce = chartReducer(chart);

function markData(view: number, hidden: string[] = []) {
  const marks = (chartSpec(chart, view, hidden, colours, 600).options.marks ?? []) as {
    data?: unknown;
  }[];
  return marks.map((m) => m.data);
}

describe("chart version 1", () => {
  it("refuses data with no view it can draw", () => {
    expect(() => parseChart({ title: "x", views: [{ type: "map" }] })).toThrow();
    expect(() => parseChart(null)).toThrow();
  });

  it("hides and shows series, but never the last visible one", () => {
    const hidden = reduce(initialState, { type: "toggleSeries", series: "Control" });
    expect(hidden.hidden).toEqual(["Control"]);
    expect(reduce(hidden, { type: "toggleSeries", series: "Fungicide" })).toBe(hidden);
    expect(reduce(hidden, { type: "toggleSeries", series: "Control" }).hidden).toEqual([]);
  });

  it("switches only to views the chart has", () => {
    expect(reduce(initialState, { type: "chooseView", view: 1 }).view).toBe(1);
    expect(reduce(initialState, { type: "chooseView", view: 7 })).toBe(initialState);
  });

  it("leaves hidden series out of the drawn data", () => {
    const [, bars] = markData(0, ["Control"]);
    expect((bars as { series: string }[]).map((b) => b.series)).toEqual(["Fungicide"]);
  });

  it("draws a box plot from its statistics, with outliers as dots", () => {
    const data = markData(1);
    expect(data[2]).toBe(chart.views[1].type === "box" ? chart.views[1].groups : null);
    expect(data[4]).toEqual([{ group: "Control", value: 20 }]);
  });

  it("colours correlations on a fixed scale from −1 to 1", () => {
    const { options } = chartSpec(chart, 2, [], colours, 600);
    expect((options.color as { domain: number[] }).domain).toEqual([-1, 0, 1]);
  });

  it("gives every series its own colour, generating more past the palette", () => {
    const series = Array.from({ length: 30 }, (_, i) => `v${i}`);
    const many = parseChart({
      title: "",
      views: [{ type: "histogram", x: { name: "v", type: "number" }, series, bins: [] }],
    });
    const range = (chartSpec(many, 0, [], colours, 600).options.color as { range: string[] }).range;
    expect(range.slice(0, 8)).toEqual([colours.first, ...colours.palette]);
    expect(new Set(range).size).toBe(30);
    expect(range[8]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("describes the hovered box with its statistics", () => {
    const [boxes, outliers] = chartSpec(chart, 1, [], colours, 600).tips;
    expect(boxes.lines(boxes.data[0] as never)).toContainEqual(["Median", "5"]);
    expect(outliers.lines(outliers.data[0] as never)).toEqual([
      ["treatment", "Control"],
      ["yield (outlier)", "20"],
    ]);
  });
});
