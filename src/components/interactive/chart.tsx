import { ComponentCard } from "./ComponentCard";
import { lazy, Suspense, useMemo, useReducer } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Renderers, RendererProps } from "./catalogue";
import { FeatureButton } from "./featuring";
import {
  chartReducer,
  initialState,
  legendOf,
  parseChart,
  SERIES_TOKENS,
  sampleOf,
  seriesColour,
} from "./chart-model";

// Plot and D3 load only when a chart is shown.
const ChartFigure = lazy(() => import("./chart-figure"));

const numberFormat = new Intl.NumberFormat();

const PALETTE = SERIES_TOKENS.map((name) => `var(${name})`);

/** A chart card: title, figure, sample note, and a legend that hides and shows values. */
function ChartView({
  preview,
  color,
  componentId,
}: Pick<RendererProps, "preview" | "color" | "componentId">) {
  const chart = useMemo(() => parseChart(preview), [preview]);
  const legend = useMemo(() => legendOf(chart), [chart]);
  const [state, dispatch] = useReducer(chartReducer(legend), initialState);
  const sample = sampleOf(chart);
  const first = chart.description.colour ?? color ?? "var(--primary)";

  return (
    <ComponentCard
      render={<section />}
      aria-label={chart.title || "Chart"}
      title={chart.title}
      actions={<FeatureButton componentId={componentId} />}
      footer={
        sample && (
          <p>
            Sample of {numberFormat.format(sample.shown)} of {numberFormat.format(sample.total)}{" "}
            points
          </p>
        )
      }
    >
      <div className="px-4 pt-3 pb-2">
        <Suspense fallback={<div className="min-h-[300px]" />}>
          <ChartFigure chart={chart} state={state} color={color} />
        </Suspense>
      </div>
      {legend && (
        <ul aria-label={legend.column} className="flex flex-wrap gap-1 px-3 pb-3">
          {legend.values.map((name, index) => {
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
                  onClick={() => dispatch({ type: "toggleValue", value: name })}
                >
                  <span
                    aria-hidden
                    className={cn("size-2.5 rounded-full", hidden && "opacity-30")}
                    style={{ background: seriesColour(index, first, PALETTE) }}
                  />
                  {name}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </ComponentCard>
  );
}

export const renderers: Renderers = {
  2: ({ preview, color, componentId }) => (
    <ChartView preview={preview} color={color} componentId={componentId} />
  ),
};
