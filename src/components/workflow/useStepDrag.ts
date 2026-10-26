import { useCallback, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Slot, StepKind } from "./workflowEdit";

/** What is being dragged: a new Step from the toolbar, or an existing Step by its ID. */
export type DragPayload =
  { kind: "new"; step: StepKind; label: string } | { kind: "move"; id: string; label: string };

/** A drag in progress. It changes only when the drop target under the pointer does, so
 * whatever reads it redraws only then. */
export interface DragState {
  payload: DragPayload;
  /** The `data-slot` of the drop target under the pointer. */
  over: string | null;
}

/** Movement below this many pixels is a press, not a drag. */
const THRESHOLD = 4;

function slotUnder(x: number, y: number): string | null {
  const target = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-slot]");
  return target?.dataset.slot ?? null;
}

/**
 * Dragging Steps with pointer events. Tauri takes native drag events over for file drops, so
 * HTML drag and drop does not fire inside the page on Windows. Drop targets are elements with
 * a `data-slot` holding a JSON `Slot`.
 */
export function useStepDrag({
  onDrop,
  onPress,
}: {
  onDrop: (payload: DragPayload, slot: Slot, point: { x: number; y: number }) => void;
  /** A press that never moved, such as a click to select. */
  onPress?: (payload: DragPayload) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  const start = useCallback(
    (payload: DragPayload) => (event: ReactPointerEvent) => {
      if (event.button !== 0) return;
      // Keeps the canvas from panning while a Step is pressed.
      event.stopPropagation();
      const from = { x: event.clientX, y: event.clientY };
      let active = false;
      const move = (e: PointerEvent) => {
        if (!active && Math.hypot(e.clientX - from.x, e.clientY - from.y) < THRESHOLD) return;
        active = true;
        setPointer({ x: e.clientX, y: e.clientY });
        const over = slotUnder(e.clientX, e.clientY);
        setDrag((d) => (d?.payload === payload && d.over === over ? d : { payload, over }));
      };
      const end = (e: PointerEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        setDrag(null);
        setPointer(null);
        if (!active) {
          if (e.type === "pointerup") onPress?.(payload);
          return;
        }
        const over = e.type === "pointerup" ? slotUnder(e.clientX, e.clientY) : null;
        if (over) onDrop(payload, JSON.parse(over) as Slot, { x: e.clientX, y: e.clientY });
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [onDrop, onPress],
  );

  return { drag, pointer, start };
}
