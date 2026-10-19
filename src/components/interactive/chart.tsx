import { lazy, Suspense, useMemo, useReducer } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Renderers, RendererProps } from "./catalogue";
import {
  chartReducer,
  initialState,
  parseChart,
  SERIES_TOKENS,
  seriesColour,
  seriesOf,
  VIEW_NAMES,
} from "./chart-model";

// Plot and D3 load only when a chart is shown.
const ChartFigure = lazy(() => import("./chart-figure"));

const numberFormat = new Intl.NumberFormat();

const PALETTE = SERIES_TOKENS.map((name) => `var(${name})`);

/** A chart in a card: its title, a toggle between its views, the figure, and a legend whose
 * entries hide and show series. */
export function ChartView({ data, color }: Pick<RendererProps, "data" | "color">) {
  const chart = useMemo(() => parseChart(data), [data]);
  const [state, dispatch] = useReducer(chartReducer(chart), initialState);
  const view = chart.views[state.view];
  const series = seriesOf(view);
  const sample = "sample" in view ? view.sample : undefined;

  return (
    <section
      aria-label={chart.title || "Chart"}
      className="w-full min-w-0 overflow-hidden rounded-[10px] border border-border bg-card"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-2.5">
        <h3 className="mr-auto text-ui font-semibold">{chart.title}</h3>
        {chart.views.length > 1 && (
          <div role="group" aria-label="Chart type" className="flex gap-1">
            {chart.views.map((v, index) => (
              <Button
                key={index}
                variant="ghost"
                size="xs"
                aria-pressed={state.view === index}
                onClick={() => dispatch({ type: "chooseView", view: index })}
              >
                {VIEW_NAMES[v.type]}
              </Button>
            ))}
          </div>
        )}
      </header>
      <div className="px-4 pt-3 pb-2">
        <Suspense fallback={<div className="min-h-[300px]" />}>
          <ChartFigure chart={chart} state={state} color={color} />
        </Suspense>
      </div>
      {series.length > 0 && (
        <ul aria-label="Series" className="flex flex-wrap gap-1 px-3 pb-3">
          {series.map((name, index) => {
            const hidden = state.hidden.includes(name);
            return (
              <li key={name}>
                <Button
                  variant="ghost"
                  size="xs"
                  aria-pressed={!hidden}
                  className={cn(
                    "aria-pressed:bg-transparent aria-pressed:text-ink-2",
                    hidden && "text-muted-foreground line-through",
                  )}
                  onClick={() => dispatch({ type: "toggleSeries", series: name })}
                >
                  <span
                    aria-hidden
                    className={cn("size-2.5 rounded-full", hidden && "opacity-30")}
                    style={{ background: seriesColour(index, color ?? "var(--primary)", PALETTE) }}
                  />
                  {name}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {sample && (
        <p className="border-t border-border px-4 py-2 text-meta text-muted-foreground">
          Sample of {numberFormat.format(sample.shown)} of {numberFormat.format(sample.total)}{" "}
          points
        </p>
      )}
    </section>
  );
}

export const renderers: Renderers = {
  1: ({ data, color }) => <ChartView data={data} color={color} />,
};
