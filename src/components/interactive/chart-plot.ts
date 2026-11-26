/** Observable Plot options for a chart description, and each hoverable shape's tooltip. */

import * as Plot from "@observablehq/plot";
import type { ChartData, Column, Mark, Row, Scale, Value } from "./chart-model";
import { legendOf, seriesColour } from "./chart-model";

/** Theme colours, read from the CSS tokens when the figure is drawn. */
export interface ChartColours {
  /** The colour of uncoloured marks and of the legend's first value: the Mini-Me's solid. */
  first: string;
  /** The values of `SERIES_TOKENS`: the colours of legend values 2 to 8. */
  palette: string[];
  /** The low end of a continuous colour scale that crosses 0. */
  negative: string;
  card: string;
  grid: string;
  axis: string;
  muted: string;
}

/** The label and value of each line of a tooltip. */
export type TipLines = [string, string][];

/** A mark whose shapes show a tooltip. Plot gives each shape the index of its row in `data`. */
interface TipSource {
  data: unknown[];
  lines: (row: never) => TipLines;
}

export interface ChartSpec {
  options: Plot.PlotOptions;
  /** The shapes of `tips[k]` are inside an element with the class `tipClass(k)`. */
  tips: TipSource[];
}

export const TIP_CLASS = "chart-tip-";

type MarkFunction = (data: unknown, options: Record<string, unknown>) => Plot.Markish;

// Every mark the sidecar lets a description name, by Plot function name.
const MARKS = {
  area: Plot.area,
  areaX: Plot.areaX,
  areaY: Plot.areaY,
  arrow: Plot.arrow,
  axisX: Plot.axisX,
  axisY: Plot.axisY,
  axisFx: Plot.axisFx,
  axisFy: Plot.axisFy,
  gridX: Plot.gridX,
  gridY: Plot.gridY,
  gridFx: Plot.gridFx,
  gridFy: Plot.gridFy,
  barX: Plot.barX,
  barY: Plot.barY,
  bollingerX: Plot.bollingerX,
  bollingerY: Plot.bollingerY,
  boxX: Plot.boxX,
  boxY: Plot.boxY,
  cell: Plot.cell,
  cellX: Plot.cellX,
  cellY: Plot.cellY,
  contour: Plot.contour,
  delaunayLink: Plot.delaunayLink,
  delaunayMesh: Plot.delaunayMesh,
  hull: Plot.hull,
  voronoi: Plot.voronoi,
  voronoiMesh: Plot.voronoiMesh,
  density: Plot.density,
  differenceX: Plot.differenceX,
  differenceY: Plot.differenceY,
  dot: Plot.dot,
  dotX: Plot.dotX,
  dotY: Plot.dotY,
  circle: Plot.circle,
  hexagon: Plot.hexagon,
  frame: Plot.frame,
  hexgrid: Plot.hexgrid,
  line: Plot.line,
  lineX: Plot.lineX,
  lineY: Plot.lineY,
  linearRegressionX: Plot.linearRegressionX,
  linearRegressionY: Plot.linearRegressionY,
  link: Plot.link,
  raster: Plot.raster,
  rect: Plot.rect,
  rectX: Plot.rectX,
  rectY: Plot.rectY,
  ruleX: Plot.ruleX,
  ruleY: Plot.ruleY,
  text: Plot.text,
  textX: Plot.textX,
  textY: Plot.textY,
  tickX: Plot.tickX,
  tickY: Plot.tickY,
  tree: Plot.tree,
  cluster: Plot.cluster,
  vector: Plot.vector,
  vectorX: Plot.vectorX,
  vectorY: Plot.vectorY,
  spike: Plot.spike,
  waffleX: Plot.waffleX,
  waffleY: Plot.waffleY,
} as unknown as Record<string, MarkFunction>;

// Marks that draw one shape per row, so a hovered shape's index is its row.
const ROW_MARKS = new Set([
  "arrow",
  "barX",
  "barY",
  "cell",
  "cellX",
  "cellY",
  "dot",
  "dotX",
  "dotY",
  "circle",
  "hexagon",
  "link",
  "rect",
  "rectX",
  "rectY",
  "ruleX",
  "ruleY",
  "text",
  "textX",
  "textY",
  "tickX",
  "tickY",
  "vector",
  "vectorX",
  "vectorY",
  "spike",
]);

// Marks drawn with a stroke; the others are filled.
const STROKED = new Set([
  "arrow",
  "bollingerX",
  "bollingerY",
  "contour",
  "density",
  "delaunayLink",
  "delaunayMesh",
  "hull",
  "voronoiMesh",
  "line",
  "lineX",
  "lineY",
  "linearRegressionX",
  "linearRegressionY",
  "link",
  "ruleX",
  "ruleY",
  "tickX",
  "tickY",
  "tree",
  "cluster",
  "vector",
  "vectorX",
  "vectorY",
  "spike",
]);

// Marks that draw the chart's frame rather than its data, and take no colour of their own.
const FRAME_MARKS = new Set([
  "axisX",
  "axisY",
  "axisFx",
  "axisFy",
  "gridX",
  "gridY",
  "gridFx",
  "gridFy",
  "frame",
  "hexgrid",
]);

// Marks whose `x` channel is a band of categories, each kept at least `MIN_BAND` pixels wide.
const X_BAND_MARKS = new Set(["barY", "cell", "cellX", "boxY", "tickY"]);

// A chart with more bands than fit is drawn wider and scrolls sideways.
const MIN_BAND = 24;

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });

function tipClass(index: number): string {
  return `${TIP_CLASS}${index}`;
}

function show(v: Value | Date | undefined): string {
  if (v === null || v === undefined) return "";
  // In UTC, like `cell` in chart-model reads it, so that a date is not shown as the day before.
  if (v instanceof Date) return v.toLocaleDateString(undefined, { timeZone: "UTC" });
  if (typeof v === "boolean") return v ? "true" : "false";
  return typeof v === "number" ? numberFormat.format(v) : v;
}

/** Each dataset's rows, less those whose legend value is hidden. */
function visibleRows(chart: ChartData, hidden: string[]): Record<string, Row[]> {
  const column = legendOf(chart)?.column;
  return Object.fromEntries(
    Object.entries(chart.datasets).map(([name, dataset]) => {
      const filtered =
        column && hidden.length && dataset.columns.some((c) => c.name === column)
          ? dataset.rows.filter((r) => !hidden.includes(String(r[column])))
          : dataset.rows;
      return [name, filtered];
    }),
  );
}

function columnOf(chart: ChartData, mark: Mark, name: string | null): Column | undefined {
  const dataset = mark.dataset ? chart.datasets[mark.dataset] : undefined;
  return dataset?.columns.find((c) => c.name === name);
}

/** The columns a description draws on `channels`, for its gridlines, colours and band width. */
function columnsOn(chart: ChartData, channels: string[]): { mark: Mark; column: Column }[] {
  return chart.description.marks.flatMap((mark) =>
    mark.channels.flatMap((c) => {
      const column = channels.includes(c.name) ? columnOf(chart, mark, c.column) : undefined;
      return column ? [{ mark, column }] : [];
    }),
  );
}

function scaleOptions(scale: Scale): Plot.ScaleOptions {
  const options: Record<string, unknown> = {
    type: scale.type,
    label: scale.label,
    domain: scale.domain,
    reverse: scale.reverse,
    zero: scale.zero,
    nice: scale.nice,
    percent: scale.percent,
    tickRotate: scale.tick_rotate,
    scheme: scale.scheme,
    legend: scale.legend,
  };
  const set = Object.entries(options).filter(([, v]) => v !== null);
  return Object.fromEntries(set) as Plot.ScaleOptions;
}

/** The colour scale: the legend's values in the Mini-Me's colour, then the theme's series
 * colours, or a continuous ramp from the card towards the Mini-Me's colour. A scheme the
 * description names replaces either. */
function colourScale(chart: ChartData, colours: ChartColours, scale?: Scale): Plot.ScaleOptions {
  const options = scale ? scaleOptions(scale) : {};
  const legend = legendOf(chart);
  if (legend) {
    const range = legend.values.map((_, i) => seriesColour(i, colours.first, colours.palette));
    const themed = scale?.scheme ? {} : { range };
    return { ...themed, ...options, domain: legend.values, legend: false };
  }
  if (scale?.scheme) return { legend: true, ...options };
  const coloured = columnsOn(chart, ["fill", "stroke"]).filter((c) => c.column.type === "number");
  if (!coloured.length) return options;
  const values = coloured.flatMap(({ mark, column }) =>
    (chart.datasets[mark.dataset ?? ""]?.rows ?? []).map((r) => r[column.name] as number),
  );
  if (!(values.some((v) => v < 0) && values.some((v) => v > 0))) {
    return { type: "linear", range: [colours.card, colours.first], legend: true, ...options };
  }
  // Centred on 0, so equal values above and below it are equally strong.
  const reach = Math.max(...values.map(Math.abs));
  const range = [colours.negative, colours.card, colours.first];
  return { type: "linear", domain: [-reach, 0, reach], range, legend: true, ...options };
}

function markOf(
  mark: Mark,
  rows: Record<string, Row[]>,
  colours: ChartColours,
  tips: TipSource[],
): Plot.Markish {
  const data = mark.dataset ? (rows[mark.dataset] ?? []) : mark.values;
  const options: Record<string, unknown> = {};
  for (const channel of mark.channels) options[channel.name] = channel.column ?? channel.value;
  for (const option of mark.options) options[option.name] = option.value;
  if (!("fill" in options || "stroke" in options) && !FRAME_MARKS.has(mark.mark)) {
    if (mark.mark.startsWith("text")) options.fill = colours.axis;
    else options[STROKED.has(mark.mark) ? "stroke" : "fill"] = colours.first;
  }
  const shown = [...new Set(mark.channels.flatMap((c) => (c.column ? [c.column] : [])))];
  if (mark.dataset && ROW_MARKS.has(mark.mark) && shown.length) {
    const lines = (row: Row): TipLines => shown.map((name) => [name, show(row[name])]);
    tips.push({ data: data as unknown[], lines: lines as (row: never) => TipLines });
    options.className = tipClass(tips.length - 1);
  }
  return MARKS[mark.mark](data, options);
}

/** Gridlines along the axis that shows numbers or dates: `y` first, as most charts read up. */
function gridOf(chart: ChartData, colours: ChartColours): Plot.Markish[] {
  const numeric = (channels: string[]) =>
    columnsOn(chart, channels).some((c) => c.column.type === "number" || c.column.type === "date");
  const style = { stroke: colours.grid, strokeOpacity: 1 };
  if (numeric(["y", "y1", "y2"])) return [Plot.gridY(style)];
  return numeric(["x", "x1", "x2"]) ? [Plot.gridX(style)] : [];
}

function bandCount(chart: ChartData, rows: Record<string, Row[]>): number {
  const bands = columnsOn(chart, ["x"])
    .filter(({ mark }) => X_BAND_MARKS.has(mark.mark))
    .flatMap(({ mark, column }) =>
      (rows[mark.dataset ?? ""] ?? []).map((r) => String(r[column.name])),
    );
  return new Set(bands).size;
}

export function chartSpec(
  chart: ChartData,
  hidden: string[],
  theme: ChartColours,
  width: number,
): ChartSpec {
  const tips: TipSource[] = [];
  const rows = visibleRows(chart, hidden);
  const { marks, scales, height, colour: own } = chart.description;
  const colours = own ? { ...theme, first: own } : theme;
  const colour = scales.find((s) => s.scale === "color");
  const options: Plot.PlotOptions = {
    width: Math.max(width, bandCount(chart, rows) * MIN_BAND + 96),
    height: height ?? 300,
    marginLeft: 56,
    // Plot shrinks a figure to its container by default; wide charts scroll instead.
    style: { color: colours.muted, fontSize: "11px", background: "transparent", maxWidth: "none" },
    ...Object.fromEntries(
      scales.filter((s) => s !== colour).map((s) => [s.scale, scaleOptions(s)]),
    ),
    color: colourScale(chart, colours, colour),
    marks: [...gridOf(chart, colours), ...marks.map((m) => markOf(m, rows, colours, tips))],
  };
  return { options, tips };
}
