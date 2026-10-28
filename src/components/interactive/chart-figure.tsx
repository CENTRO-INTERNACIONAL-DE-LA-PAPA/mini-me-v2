import * as Plot from "@observablehq/plot";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { type ChartData, type ChartState, SERIES_TOKENS } from "./chart-model";
import { type ChartColours, type ChartSpec, chartSpec, TIP_CLASS, type TipLines } from "./chart-plot";

function token(element: Element, name: string): string {
  return getComputedStyle(element).getPropertyValue(name).trim();
}

/** The theme's chart colours, read when the figure is drawn; Plot writes colours as SVG
 * attributes, where CSS variables don't apply. */
function readColours(element: Element, color: string | undefined): ChartColours {
  return {
    first: color ?? token(element, "--primary"),
    palette: SERIES_TOKENS.map((name) => token(element, name)),
    negative: token(element, "--chart-2"),
    card: token(element, "--card"),
    grid: token(element, "--line-soft"),
    axis: token(element, "--foreground"),
    muted: token(element, "--muted-foreground"),
  };
}

interface Tip {
  left: number;
  top: number;
  lines: TipLines;
}

/** The tooltip of the shape under the pointer, or null. Only the shape itself counts: Plot
 * draws each shape of a mark with that mark's class and binds it to the index of its row. */
function tipAt(target: EventTarget, spec: ChartSpec): TipLines | null {
  const shape = target as Element & { __data__?: unknown };
  const mark = shape.closest?.(`[class*="${TIP_CLASS}"]`);
  if (!mark || mark === shape || typeof shape.__data__ !== "number") return null;
  const name = [...mark.classList].find((c) => c.startsWith(TIP_CLASS));
  const source = name ? spec.tips[Number(name.slice(TIP_CLASS.length))] : undefined;
  const row = source?.data[shape.__data__];
  return source && row !== undefined ? source.lines(row as never) : null;
}

/** The figure of one chart, drawn by Observable Plot into a container React leaves empty.
 * Loaded on demand, so Plot is only fetched when a Conversation shows a chart. */
export default function ChartFigure({
  chart,
  state,
  color,
}: {
  chart: ChartData;
  state: ChartState;
  color?: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const spec = useRef<ChartSpec | null>(null);
  const [width, setWidth] = useState(0);
  const [tip, setTip] = useState<Tip | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);
  // Error boundaries don't see errors in effects, so a failed draw is rethrown here and the
  // component shows its text instead.
  if (failure) throw failure;

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = container.current;
    if (!element || width === 0) return;
    let figure: Element | undefined;
    try {
      spec.current = chartSpec(chart, state.view, state.hidden, readColours(element, color), width);
      figure = Plot.plot(spec.current.options);
      element.replaceChildren(figure);
      setTip(null);
    } catch (error) {
      setFailure(error instanceof Error ? error : new Error(String(error)));
    }
    return () => figure?.remove();
  }, [chart, state, color, width]);

  function onPointerMove(event: PointerEvent) {
    const lines = spec.current && tipAt(event.target, spec.current);
    const bounds = frame.current?.getBoundingClientRect();
    if (!lines || !bounds) return setTip(null);
    setTip({ left: event.clientX - bounds.left, top: event.clientY - bounds.top, lines });
  }

  return (
    <div ref={frame} className="relative" onPointerMove={onPointerMove} onPointerLeave={() => setTip(null)}>
      <div ref={container} className="min-h-[300px] w-full overflow-x-auto overscroll-x-contain" />
      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 grid max-w-64 gap-0.5 rounded-[10px] border border-border bg-popover px-2.5 py-1.5 text-meta whitespace-nowrap"
          style={{
            left: tip.left,
            top: tip.top,
            // The card clips its content, so the tooltip opens towards the middle of the
            // figure: left of the pointer on the right half, below it near the top.
            transform: `translate(${tip.left > (frame.current?.clientWidth ?? 0) / 2 ? "calc(-100% - 12px)" : "12px"}, ${tip.top < 96 ? "16px" : "calc(-100% - 8px)"})`,
          }}
        >
          {tip.lines.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium text-foreground tabular-nums">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
