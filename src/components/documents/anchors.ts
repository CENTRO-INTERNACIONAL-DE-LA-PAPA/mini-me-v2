import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import type { Anchor, Anchors, CommentThread, Suggestion, Uuid } from "../../protocol/types";

/** Where a passage is in the source, in UTF-16 offsets as CodeMirror counts them; null when it is
 * detached. */
export type Placement = { from: number; to: number } | null;

/** A thread or suggestion as stored: its anchor and the passage's text when last saved. */
interface Anchored {
  id: Uuid;
  start: number;
  end: number;
  quote: string;
}

/** Places each item when a document opens: on its anchor when that still reads its quote, else
 * on its quote when the quote occurs exactly once in `text`, else detached. */
function place(text: string, items: Anchored[]): Map<Uuid, Placement> {
  const placed = new Map<Uuid, Placement>();
  for (const { id, start, end, quote } of items) {
    if (text.slice(start, end) === quote) {
      placed.set(id, { from: start, to: end });
      continue;
    }
    const at = text.indexOf(quote);
    const once = at >= 0 && text.indexOf(quote, at + 1) < 0;
    placed.set(id, once ? { from: at, to: at + quote.length } : null);
  }
  return placed;
}

export const placeThreads = (text: string, threads: CommentThread[]) =>
  place(
    text,
    threads.map((t) => ({ ...t, id: t.conversation_id })),
  );

export const placeSuggestions = (text: string, suggestions: Suggestion[]) =>
  place(text, suggestions);

/** A field of placements, moved with every edit, and the effect that replaces them all. Text
 * typed right before or right after a passage stays outside it, and a passage deleted entirely
 * is detached. */
function placementField() {
  const set = StateEffect.define<Map<Uuid, Placement>>();
  const field = StateField.define<Map<Uuid, Placement>>({
    create: () => new Map(),
    update(placements, transaction) {
      for (const effect of transaction.effects) {
        if (effect.is(set)) return effect.value;
      }
      if (!transaction.docChanged) return placements;
      const moved = new Map<Uuid, Placement>();
      for (const [id, placement] of placements) {
        if (placement === null) {
          moved.set(id, null);
          continue;
        }
        const from = transaction.changes.mapPos(placement.from, 1);
        const to = transaction.changes.mapPos(placement.to, -1);
        moved.set(id, from < to ? { from, to } : null);
      }
      return moved;
    },
  });
  return { set, field };
}

const threads = placementField();
const suggestions = placementField();

export const threadPlacements = threads.field;
export const setThreadPlacements = threads.set;
export const suggestionPlacements = suggestions.field;
export const setSuggestionPlacements = suggestions.set;

/** The anchors to save with the document: every placed passage. A detached thread or suggestion
 * keeps the anchor it had, so the next open can look for its quote again. */
export function savedAnchors(state: EditorState): Anchors {
  const placed = (field: StateField<Map<Uuid, Placement>>) => {
    const anchors: Anchor[] = [];
    for (const [id, placement] of state.field(field)) {
      if (placement) anchors.push({ id, start: placement.from, end: placement.to });
    }
    return anchors;
  };
  return { threads: placed(threadPlacements), suggestions: placed(suggestionPlacements) };
}
