/** `chart` version 1 data, as *Plot* builds it, and the state of a chart's controls. The
 * controls only change what the UI shows; nothing here is saved. */

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

/** The chart's data, or an error for data no view can be drawn from, so the component
 * shows its text instead. */
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

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
}

/** An oklch colour as hex; Plot writes colours as SVG attributes, which may not parse
 * `oklch()`. */
export function oklchToHex(lightness: number, chroma: number, hue: number): string {
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${rgb.map((c) => linearToSrgb(c).toString(16).padStart(2, "0")).join("")}`;
}

/** The colour of the series at `index`: the Mini-Me's colour, then `palette` (the values of
 * `SERIES_TOKENS`), then generated colours, so every series has one. */
export function seriesColour(index: number, first: string, palette: string[]): string {
  if (index === 0) return first;
  if (index <= palette.length) return palette[index - 1];
  const step = index - palette.length - 1;
  const hue = (GENERATED.start + step * GENERATED.step) % 360;
  return oklchToHex(GENERATED.lightness, GENERATED.chroma, hue);
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
