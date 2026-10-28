/** Observable Plot options for one view of a `chart`, and what each hoverable shape shows.
 * Plot draws the figure and its axes; the card, the controls and the tooltip are React's. */

import * as Plot from "@observablehq/plot";
import type { Bin, BoxGroup, ChartData, Column, Point, Value, View } from "./chart-model";
import { seriesColour, seriesOf } from "./chart-model";

/** Theme colours, read from the CSS tokens when the figure is drawn. */
export interface ChartColours {
  /** The colour of the first series: the Mini-Me's solid. */
  first: string;
  /** The values of `SERIES_TOKENS`: the colours of series 2 to 8. */
  palette: string[];
  /** The colour of negative correlations. */
  negative: string;
  card: string;
  grid: string;
  axis: string;
  muted: string;
}

/** The label and value of each line of a tooltip. */
export type TipLines = [string, string][];

/** A mark whose shapes show a tooltip. Plot gives each shape the index of its row in `data`. */
export interface TipSource {
  data: unknown[];
  lines: (row: never) => TipLines;
}

export interface ChartSpec {
  options: Plot.PlotOptions;
  /** The shapes of `tips[k]` are inside an element with the class `tipClass(k)`. */
  tips: TipSource[];
}

export const TIP_CLASS = "chart-tip-";

export function tipClass(index: number): string {
  return `${TIP_CLASS}${index}`;
}

const HEIGHT = 300;

// Bars, boxes and heatmap cells keep at least this many pixels each; a chart with more of
// them than fit is drawn wider and scrolls sideways.
const MIN_BAND = 24;

function bandWidth(width: number, bands: number, margins: number): number {
  return Math.max(width, bands * MIN_BAND + margins);
}

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });

// An ISO time of day without a time zone: "T" followed by no "Z", "+" or "-".
const NO_ZONE = /T[^Z+-]*$/;

/** Dates arrive as ISO text; Plot draws them on a time scale only as `Date`s. Text without
 * a time zone is read as UTC, the zone Plot's time axis shows; JavaScript already reads a
 * date without a time of day that way, but reads a time of day without a zone as local. */
function value(column: Column | undefined, v: Value): Value | Date {
  if (column?.type !== "date" || typeof v !== "string") return v;
  return new Date(NO_ZONE.test(v) ? `${v}Z` : v);
}

function show(v: Value | Date | undefined): string {
  if (v === null || v === undefined) return "";
  // In UTC, like `value` reads it, so that a date is not shown as the day before.
  if (v instanceof Date) return v.toLocaleDateString(undefined, { timeZone: "UTC" });
  return typeof v === "number" ? numberFormat.format(v) : v;
}

function visible<T extends { series?: string }>(rows: T[], hidden: string[]): T[] {
  return hidden.length ? rows.filter((r) => !r.series || !hidden.includes(r.series)) : rows;
}

/** Series keep their colour while others are hidden: each takes it from its place in the
 * view's full list of series. */
function colourScale(view: View, colours: ChartColours): Plot.ScaleOptions | undefined {
  const series = seriesOf(view);
  if (!series.length) return undefined;
  return {
    domain: series,
    range: series.map((_, i) => seriesColour(i, colours.first, colours.palette)),
  };
}

function seriesLine(view: View, row: { series?: string }): TipLines {
  const column = "series_column" in view ? view.series_column : undefined;
  return row.series === undefined ? [] : [[column ?? "Series", row.series]];
}

export function chartSpec(
  chart: ChartData,
  viewIndex: number,
  hidden: string[],
  colours: ChartColours,
  width: number,
): ChartSpec {
  const view = chart.views[viewIndex];
  const tips: TipSource[] = [];
  // Registers a mark's tooltip and returns the class its shapes are drawn with.
  const tip = <T,>(data: T[], lines: (row: T) => TipLines) => {
    tips.push({ data, lines: lines as (row: never) => TipLines });
    return tipClass(tips.length - 1);
  };
  const hasSeries = seriesOf(view).length > 0;
  const fill = hasSeries ? "series" : colours.first;
  const base: Plot.PlotOptions = {
    width,
    height: HEIGHT,
    marginLeft: 56,
    // Plot shrinks a figure to its container by default; wide charts scroll instead.
    style: { color: colours.muted, fontSize: "11px", background: "transparent", maxWidth: "none" },
    color: colourScale(view, colours),
  };
  const grid = Plot.gridY({ stroke: colours.grid, strokeOpacity: 1 });
  const baseline = Plot.ruleY([0], { stroke: colours.axis });
  const spec = (options: Plot.PlotOptions): ChartSpec => ({ options: { ...base, ...options }, tips });

  switch (view.type) {
    case "histogram": {
      const bins = visible(view.bins, hidden).map((b: Bin) => ({
        ...b,
        x0: value(view.x, b.x0),
        x1: value(view.x, b.x1),
      }));
      const className = tip(bins, (b) => [
        [view.x.name, `${show(b.x0)} – ${show(b.x1)}`],
        ["Rows", show(b.count)],
        ...seriesLine(view, b),
      ]);
      return spec({
        x: { label: view.x.name },
        y: { label: "Rows" },
        marks: [
          grid,
          Plot.rectY(bins, { x1: "x0", x2: "x1", y: "count", fill, insetLeft: 1, className }),
          baseline,
        ],
      });
    }
    case "bar": {
      const bars = visible(view.bars, hidden);
      // A count bar chart counts rows, even when its data names a `y` column.
      const label =
        view.y && view.aggregate !== "count" ? `${view.aggregate} of ${view.y.name}` : "Rows";
      const categories = [...new Set(view.bars.map((b) => b.x))];
      const className = tip(bars, (b) => [
        [view.x.name, b.x],
        [label, show(b.y)],
        ...seriesLine(view, b),
      ]);
      // Totals stack; averages of several series stand side by side, since stacking them
      // would add means together.
      const grouped = hasSeries && (view.aggregate === "mean" || view.aggregate === "median");
      if (grouped) {
        return spec({
          width: bandWidth(width, categories.length * seriesOf(view).length, 96),
          fx: { label: view.x.name, domain: categories },
          x: { axis: null, domain: seriesOf(view) },
          y: { label },
          marks: [
            grid,
            Plot.barY(bars, { fx: "x", x: "series", y: "y", fill, className }),
            baseline,
          ],
        });
      }
      return spec({
        width: bandWidth(width, categories.length, 96),
        x: { label: view.x.name, domain: categories },
        y: { label },
        marks: [grid, Plot.barY(bars, { x: "x", y: "y", fill, className }), baseline],
      });
    }
    case "line":
    case "scatter": {
      const points = visible(view.points, hidden).map((p: Point) => ({
        ...p,
        x: value(view.x, p.x),
      }));
      const yLabel =
        (view.type === "line" && view.aggregate ? `${view.aggregate} of ` : "") + view.y.name;
      const className = tip(points, (p) => [
        [view.x.name, show(p.x)],
        [yLabel, show(p.y)],
        ...seriesLine(view, p),
      ]);
      const dots = Plot.dot(points, {
        x: "x",
        y: "y",
        fill,
        r: view.type === "line" ? 3 : 3.5,
        fillOpacity: view.type === "line" ? 1 : 0.8,
        className,
      });
      const line = Plot.lineY(points, {
        x: "x",
        y: "y",
        stroke: fill,
        z: hasSeries ? "series" : null,
      });
      return spec({
        x: { label: view.x.name },
        y: { label: yLabel },
        marks: view.type === "line" ? [grid, line, dots] : [grid, dots],
      });
    }
    case "box": {
      const groups = view.groups;
      const outliers = groups.flatMap((g: BoxGroup) =>
        g.outliers.map((v) => ({ group: g.group, value: v })),
      );
      const boxes = tip(groups, (g) => [
        [view.x.name, g.group],
        ["Median", show(g.median)],
        ["Middle half", `${show(g.q1)} – ${show(g.q3)}`],
        ["Whiskers", `${show(g.low)} – ${show(g.high)}`],
        ["Rows", show(g.count)],
      ]);
      const outlying = tip(outliers, (o) => [
        [view.x.name, o.group],
        [`${view.y.name} (outlier)`, show(o.value)],
      ]);
      return spec({
        width: bandWidth(width, groups.length, 96),
        x: { label: view.x.name, domain: groups.map((g) => g.group) },
        y: { label: view.y.name },
        marks: [
          grid,
          Plot.ruleX(groups, { x: "group", y1: "low", y2: "high", stroke: colours.axis }),
          Plot.barY(groups, {
            x: "group",
            y1: "q1",
            y2: "q3",
            fill: colours.first,
            className: boxes,
          }),
          Plot.tickY(groups, { x: "group", y: "median", stroke: colours.axis, strokeWidth: 2 }),
          Plot.dot(outliers, {
            x: "group",
            y: "value",
            stroke: colours.axis,
            fill: colours.card,
            r: 3,
            className: outlying,
          }),
        ],
      });
    }
    case "heatmap": {
      const side = Math.max(
        Math.min(width - 64, 48 * view.columns.length + 96),
        MIN_BAND * view.columns.length + 96,
      );
      const className = tip(view.cells, (c) => [
        ["Columns", `${c.y} – ${c.x}`],
        ["Correlation", c.value === null ? "not enough values" : c.value.toFixed(2)],
      ]);
      return spec({
        width: side + 64,
        height: side,
        marginLeft: 96,
        marginBottom: 64,
        x: { label: null, domain: view.columns, tickRotate: -30 },
        y: { label: null, domain: view.columns },
        // Negative correlations shade towards grey, positive ones towards the Mini-Me's
        // colour, with no correlation in the card's colour.
        color: {
          type: "linear",
          domain: [-1, 0, 1],
          range: [colours.negative, colours.card, colours.first],
          legend: true,
          label: "Correlation",
        },
        marks: [
          Plot.cell(view.cells, { x: "x", y: "y", fill: "value", inset: 0.5, className }),
          Plot.text(view.cells, {
            x: "x",
            y: "y",
            text: (c: { value: number | null }) => (c.value === null ? "" : c.value.toFixed(2)),
            fill: colours.axis,
            pointerEvents: "none",
          }),
        ],
      });
    }
  }
}
