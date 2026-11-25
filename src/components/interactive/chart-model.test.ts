import { describe, expect, it } from "vitest";
import { chartReducer, initialState, legendOf, parseChart } from "./chart-model";
import { type ChartColours, chartSpec } from "./chart-plot";

const colours: ChartColours = {
  first: "#9769DC",
  palette: ["#eb6834", "#1baf7a", "#2a78d6", "#eda100", "#e87ba4", "#008300", "#e34948"],
  negative: "#3d3d3d",
  card: "#ffffff",
  grid: "#f1f0eb",
  axis: "#0a0a0a",
  muted: "#8a8a8a",
};

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

function colourScale(domain: string[]) {
  return {
    scale: "color",
    type: null,
    label: null,
    domain,
    reverse: null,
    zero: null,
    nice: null,
    percent: null,
    tick_rotate: null,
    scheme: null,
    legend: null,
  };
}

// Mean yield of two varieties in two years, drawn as a dumbbell: a rule per variety and a dot
// per year.
const dumbbell = parseChart({
  title: "Yield by variety",
  description: {
    title: "Yield by variety",
    height: 300,
    marks: [
      mark("ruleY", "means", ["x", "variety"], ["y1", "mean_yield"]),
      mark("dot", "means", ["x", "variety"], ["y", "mean_yield"], ["fill", "year"]),
    ],
    scales: [colourScale(["2023", "2024"])],
  },
  datasets: {
    means: {
      columns: [
        { name: "variety", type: "text" },
        { name: "year", type: "text" },
        { name: "mean_yield", type: "number" },
      ],
      rows: [
        ["Yungay", "2023", 20],
        ["Yungay", "2024", 24],
        ["Canchan", "2023", 18],
        ["Canchan", "2024", 21],
      ],
    },
  },
});

function marks(chart = dumbbell, hidden: string[] = []) {
  return (chartSpec(chart, hidden, colours, 600).options.marks ?? []) as {
    ariaLabel?: string;
    data?: unknown[];
  }[];
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

  it("draws each described mark after the gridlines", () => {
    expect(marks().map((m) => m.ariaLabel)).toEqual(["y-grid", "rule", "dot"]);
  });

  it("hides and shows legend values, but never the last visible one", () => {
    const reduce = chartReducer(legendOf(dumbbell));
    const hidden = reduce(initialState, { type: "toggleValue", value: "2023" });
    expect(hidden.hidden).toEqual(["2023"]);
    expect(reduce(hidden, { type: "toggleValue", value: "2024" })).toBe(hidden);
    expect(reduce(hidden, { type: "toggleValue", value: "2023" }).hidden).toEqual([]);
    const [, , dots] = marks(dumbbell, ["2023"]);
    expect((dots.data as { year: string }[]).map((r) => r.year)).toEqual(["2024", "2024"]);
  });

  it("gives every legend value its own colour, generating more past the palette", () => {
    const values = Array.from({ length: 30 }, (_, i) => `v${i}`);
    const scales = [colourScale(values)];
    const many = { ...dumbbell, description: { ...dumbbell.description, scales } };
    const range = (chartSpec(many, [], colours, 600).options.color as { range: string[] }).range;
    expect(range.slice(0, 8)).toEqual([colours.first, ...colours.palette]);
    expect(new Set(range).size).toBe(30);
    expect(range[8]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("colours the legend's first value in the chart's own colour when it has one", () => {
    const blue = { ...dumbbell, description: { ...dumbbell.description, colour: "steelblue" } };
    const range = (chartSpec(blue, [], colours, 600).options.color as { range: string[] }).range;
    expect(range[0]).toBe("steelblue");
  });

  it("shows a hovered row's columns, and no tooltip on marks computed from many rows", () => {
    const spec = chartSpec(dumbbell, [], colours, 600);
    const dots = spec.tips[1];
    expect(dots.lines(dots.data[1] as never)).toEqual([
      ["variety", "Yungay"],
      ["mean_yield", "24"],
      ["year", "2024"],
    ]);
    const boxes = {
      ...dumbbell,
      description: { ...dumbbell.description, marks: [mark("boxY", "means", ["y", "mean_yield"])] },
    };
    expect(chartSpec(boxes, [], colours, 600).tips).toEqual([]);
  });
});
