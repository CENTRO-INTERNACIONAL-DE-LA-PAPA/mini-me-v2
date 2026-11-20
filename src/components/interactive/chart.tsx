import { ComponentCard } from "./ComponentCard";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { lazy, Suspense, useMemo, useReducer } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Renderers, RendererProps } from "./catalogue";
import { FeatureButton } from "./featuring";
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

/** A chart card: title, view toggle, figure, and a legend that hides and shows series. */
export function ChartView({
  preview,
  color,
  componentId,
}: Pick<RendererProps, "preview" | "color" | "componentId">) {
  const chart = useMemo(() => parseChart(preview), [preview]);
  const [state, dispatch] = useReducer(chartReducer(chart), initialState);
  const view = chart.views[state.view];
  const series = seriesOf(view);
  const sample = "sample" in view ? view.sample : undefined;

  return (
    <ComponentCard
      render={<section />}
      aria-label={chart.title || "Chart"}
      title={chart.title}
      actions={
        <>
          {chart.views.length > 1 && (
            <ToggleGroup
              aria-label="Chart type"
              value={[String(state.view)]}
              onValueChange={(value) =>
                value.length > 0 && dispatch({ type: "chooseView", view: Number(value[0]) })
              }
            >
              {chart.views.map((v, index) => (
                <ToggleGroupItem key={index} value={String(index)}>
                  {VIEW_NAMES[v.type]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          <FeatureButton componentId={componentId} />
        </>
      }
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
    </ComponentCard>
  );
}

export const renderers: Renderers = {
  1: ({ preview, color, componentId }) => (
    <ChartView preview={preview} color={color} componentId={componentId} />
  ),
};
