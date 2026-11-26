/** `chart` version 2 data, as *Plot* builds it, and the legend's state, which is never saved. */

import { oklchToHex } from "../minime/miniMeColors";

type ColumnType = "number" | "text" | "date" | "boolean";

export interface Column {
  name: string;
  type: ColumnType;
}

export type Value = number | string | boolean | null;

export interface Sample {
  shown: number;
  total: number;
}

interface DatasetData {
  columns: Column[];
  rows: Value[][];
  sample?: Sample;
}

export interface Channel {
  name: string;
  column: string | null;
  value: Value;
}

export interface Mark {
  mark: string;
  dataset: string | null;
  values: Value[];
  channels: Channel[];
  options: { name: string; value: string | number | boolean | Record<string, string> }[];
}

export interface Scale {
  scale: string;
  type: string | null;
  label: string | null;
  domain: Value[] | null;
  reverse: boolean | null;
  zero: boolean | null;
  nice: boolean | null;
  percent: boolean | null;
  tick_rotate: number | null;
  scheme: string | null;
  legend: boolean | null;
}

export interface Description {
  title: string;
  height: number | null;
  /** Replaces the Mini-Me's colour for uncoloured marks and the legend's first value. */
  colour: string | null;
  marks: Mark[];
  scales: Scale[];
}

export type Row = Record<string, Value | Date>;

/** A dataset's rows as objects, dates as `Date`s, with its column types. */
export interface Dataset {
  columns: Column[];
  rows: Row[];
  sample?: Sample;
}

export interface ChartData {
  title: string;
  description: Description;
  datasets: Record<string, Dataset>;
}

// An ISO time of day without a time zone: "T" followed by no "Z", "+" or "-".
const NO_ZONE = /T[^Z+-]*$/;

/** Dates as the `Date`s Plot's time scale needs. Text without a zone is read as UTC, the zone
 * the axis shows; JavaScript alone would read a time of day without a zone as local. */
function cell(column: Column, v: Value): Value | Date {
  if (column.type !== "date" || typeof v !== "string") return v;
  return new Date(NO_ZONE.test(v) ? `${v}Z` : v);
}

function toDataset(data: DatasetData): Dataset {
  const rows = data.rows.map((row) =>
    Object.fromEntries(data.columns.map((c, i) => [c.name, cell(c, row[i])])),
  );
  return { columns: data.columns, rows, sample: data.sample };
}

/** The chart's data; throws when it has no mark to draw, so the component shows its text. */
export function parseChart(data: unknown): ChartData {
  const chart = data as Partial<{
    title: string;
    description: Description;
    datasets: Record<string, DatasetData>;
  }> | null;
  const marks = chart?.description?.marks;
  if (!Array.isArray(marks) || !marks.length || typeof chart?.datasets !== "object") {
    throw new Error("chart data has no mark this version can draw");
  }
  const datasets = Object.fromEntries(
    Object.entries(chart.datasets ?? {}).map(([name, d]) => [name, toDataset(d)]),
  );
  return {
    title: typeof chart.title === "string" ? chart.title : "",
    description: chart.description as Description,
    datasets,
  };
}

export interface Legend {
  column: string;
  values: string[];
}

/** The colour domain of the first mark coloured by a text or boolean column. */
export function legendOf(chart: ChartData): Legend | null {
  for (const mark of chart.description.marks) {
    const channel = mark.channels.find(
      (c) => (c.name === "fill" || c.name === "stroke") && c.column,
    );
    const dataset = mark.dataset ? chart.datasets[mark.dataset] : undefined;
    const column = dataset?.columns.find((c) => c.name === channel?.column);
    if (!column) continue;
    if (column.type !== "text" && column.type !== "boolean") return null;
    const scale = chart.description.scales.find((s) => s.scale === "color");
    const values = (scale?.domain ?? []).map(String);
    return values.length ? { column: column.name, values } : null;
  }
  return null;
}

/** The sample of the most sampled dataset, for the card's note. */
export function sampleOf(chart: ChartData): Sample | undefined {
  const samples = Object.values(chart.datasets).flatMap((d) => (d.sample ? [d.sample] : []));
  return samples.sort((a, b) => b.total - a.total)[0];
}

/** Legend values 2 to 8 take these theme tokens; the first takes the Mini-Me's colour. */
export const SERIES_TOKENS = [2, 3, 4, 5, 6, 7, 8].map((n) => `--chart-series-${n}`);

// Values past the palette keep the oklch lightness and chroma of a Mini-Me solid and step the
// hue by the golden angle, so each new value lands far from the hues before it.
const GENERATED = { lightness: 0.64, chroma: 0.15, start: 20, step: 137.508 };

/** Value `index`'s colour: the Mini-Me's (`first`), then `palette`, then generated ones. */
export function seriesColour(index: number, first: string, palette: string[]): string {
  if (index === 0) return first;
  if (index <= palette.length) return palette[index - 1];
  const step = index - palette.length - 1;
  const hue = (GENERATED.start + step * GENERATED.step) % 360;
  // Hex, since Plot's SVG attributes may not parse `oklch()`.
  return oklchToHex([GENERATED.lightness, GENERATED.chroma, hue]);
}

export interface ChartState {
  hidden: string[];
}

type ChartAction = { type: "toggleValue"; value: string };

export const initialState: ChartState = { hidden: [] };

export function chartReducer(legend: Legend | null) {
  return (state: ChartState, action: ChartAction): ChartState => {
    if (state.hidden.includes(action.value)) {
      return { hidden: state.hidden.filter((v) => v !== action.value) };
    }
    const visible = (legend?.values ?? []).filter((v) => !state.hidden.includes(v));
    // The last visible value stays, so the chart never goes blank.
    if (visible.length <= 1 || !visible.includes(action.value)) return state;
    return { hidden: [...state.hidden, action.value] };
  };
}
