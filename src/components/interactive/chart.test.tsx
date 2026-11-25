import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChartView } from "./chart";

const data = {
  title: "Yield against height",
  description: {
    title: "Yield against height",
    height: 300,
    marks: [
      {
        mark: "dot",
        dataset: "rows",
        values: [],
        channels: [
          { name: "x", column: "height", value: null },
          { name: "y", column: "yield", value: null },
          { name: "fill", column: "site", value: null },
        ],
        options: [],
      },
    ],
    scales: [
      {
        scale: "color",
        type: null,
        label: null,
        domain: ["Huancayo", "La Molina"],
        reverse: null,
        zero: null,
        nice: null,
        percent: null,
        tick_rotate: null,
        scheme: null,
        legend: null,
      },
    ],
  },
  datasets: {
    rows: {
      columns: [
        { name: "height", type: "number" },
        { name: "yield", type: "number" },
        { name: "site", type: "text" },
      ],
      rows: [[1, 2, "Huancayo"]],
      sample: { shown: 5000, total: 48210 },
    },
  },
};

describe("chart card", () => {
  it("shows the title, the legend and the sample note", () => {
    const html = renderToStaticMarkup(<ChartView preview={data} />);
    expect(html).toContain("Yield against height");
    expect(html).toContain('aria-label="site"');
    expect(html).toContain("La Molina");
    expect(html).toContain("Sample of 5,000 of 48,210 points");
  });
});
