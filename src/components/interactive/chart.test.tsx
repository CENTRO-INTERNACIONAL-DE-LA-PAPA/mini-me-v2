import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChartView } from "./chart";
import { ComponentReferencesProvider } from "./component-references";

const data = {
  title: "Yield against height",
  views: [
    {
      type: "scatter",
      x: { name: "height", type: "number" },
      y: { name: "yield", type: "number" },
      points: [{ x: 1, y: 2 }],
      sample: { shown: 5000, total: 48210 },
    },
    {
      type: "line",
      x: { name: "height", type: "number" },
      y: { name: "yield", type: "number" },
      points: [{ x: 1, y: 2 }],
    },
  ],
};

describe("chart card", () => {
  it("shows the title, a toggle between views and the sample note", () => {
    const html = renderToStaticMarkup(<ChartView data={data} />);
    expect(html).toContain("Yield against height");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain(">Scatter</button>");
    expect(html).toContain(">Line</button>");
    expect(html).toContain("Sample of 5,000 of 48,210 points");
  });

  it("has a reference button inside a Conversation", () => {
    const chart = { id: "c1", name: "Yield-against-height", kind: "chart" as const };
    const names = new Map([["c1", chart]]);
    const html = renderToStaticMarkup(
      <ComponentReferencesProvider names={names} append={() => {}}>
        <ChartView data={data} componentId="c1" />
      </ComponentReferencesProvider>,
    );
    expect(html).toContain('aria-label="Add $Yield-against-height to the message"');
  });
});
