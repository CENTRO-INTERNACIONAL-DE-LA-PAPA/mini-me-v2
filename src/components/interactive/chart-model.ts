/** `chart` version 1 data, as *Plot* builds it, and the controls' state, which is never saved. */

import { oklchToHex } from "../minime/miniMeColors";

export type ColumnType = "number" | "text" | "date" | "boolean";

export interface Column {
  name: string;
  type: ColumnType;
}

export type Value = number | string | null;

export interface Bin {
  x0: Value;
  x1: Value;
  count: number;
  series?: string;
}

export interface Bar {
  x: string;
  y: number | null;
  series?: string;
}

export interface Point {
  x: Value;
  y: number | null;
  series?: string;
}

export interface BoxGroup {
  group: string;
  q1: number;
  median: number;
  q3: number;
  low: number;
  high: number;
  count: number;
  outliers: number[];
}

export interface Cell {
  x: string;
  y: string;
  value: number | null;
}

interface Series {
  /** Series names in drawing order, "Other" last. */
  series?: string[];
  series_column?: string;
}

export type View =
  | ({ type: "histogram"; x: Column; bins: Bin[] } & Series)
  | ({ type: "bar"; x: Column; y?: Column; aggregate: string; bars: Bar[] } & Series)
  | ({
      type: "line" | "scatter";
      x: Column;
      y: Column;
      aggregate?: string;
      points: Point[];
      sample?: { shown: number; total: number };
    } & Series)
  | { type: "box"; x: Column; y: Column; groups: BoxGroup[] }
  | { type: "heatmap"; columns: string[]; cells: Cell[] };

export interface ChartData {
  title: string;
  views: View[];
}

const TYPES = new Set(["histogram", "bar", "line", "scatter", "box", "heatmap"]);

/** The chart's data; throws when no view can be drawn, so the component shows its text. */
export function parseChart(data: unknown): ChartData {
  const chart = data as Partial<ChartData> | null;
  const views = Array.isArray(chart?.views) ? chart.views : [];
  if (!views.length || !views.every((v) => TYPES.has((v as View | null)?.type ?? ""))) {
    throw new Error("chart data has no view this version can draw");
  }
  return { title: typeof chart?.title === "string" ? chart.title : "", views };
}

export const VIEW_NAMES: Record<View["type"], string> = {
  histogram: "Histogram",
  bar: "Bar",
  line: "Line",
  scatter: "Scatter",
  box: "Box",
  heatmap: "Heatmap",
};

/** The series a view draws, in order; empty when it has none. */
export function seriesOf(view: View): string[] {
  return "series" in view && Array.isArray(view.series) ? view.series : [];
}

/** Series 2 to 8 take these theme tokens; series 1 takes the Mini-Me's colour. */
export const SERIES_TOKENS = [2, 3, 4, 5, 6, 7, 8].map((n) => `--chart-series-${n}`);

// Series past the palette keep the oklch lightness and chroma of a Mini-Me solid and step the
// hue by the golden angle, so each new series lands far from the hues before it.
const GENERATED = { lightness: 0.64, chroma: 0.15, start: 20, step: 137.508 };

/** Series `index`'s colour: the Mini-Me's (`first`), then `palette`, then generated ones. */
export function seriesColour(index: number, first: string, palette: string[]): string {
  if (index === 0) return first;
  if (index <= palette.length) return palette[index - 1];
  const step = index - palette.length - 1;
  const hue = (GENERATED.start + step * GENERATED.step) % 360;
  // Hex, since Plot's SVG attributes may not parse `oklch()`.
  return oklchToHex([GENERATED.lightness, GENERATED.chroma, hue]);
}

export interface ChartState {
  view: number;
  hidden: string[];
}

export type ChartAction =
  | { type: "toggleSeries"; series: string }
  | { type: "chooseView"; view: number };

export const initialState: ChartState = { view: 0, hidden: [] };

export function chartReducer(chart: ChartData) {
  return (state: ChartState, action: ChartAction): ChartState => {
    switch (action.type) {
      case "toggleSeries": {
        if (state.hidden.includes(action.series)) {
          return { ...state, hidden: state.hidden.filter((s) => s !== action.series) };
        }
        const visible = seriesOf(chart.views[state.view]).filter(
          (s) => !state.hidden.includes(s),
        );
        // The last visible series stays, so the chart never goes blank.
        if (visible.length <= 1 || !visible.includes(action.series)) return state;
        return { ...state, hidden: [...state.hidden, action.series] };
      }
      case "chooseView":
        return chart.views[action.view] ? { ...state, view: action.view } : state;
    }
  };
}
