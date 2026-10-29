import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import type { Anchor, CommentThread, Uuid } from "../../protocol/types";

/** Where a thread's passage is in the source, in UTF-16 offsets as CodeMirror counts them;
 * null when the thread is detached. */
export type Placement = { from: number; to: number } | null;

/** Places each thread when a document opens: on its anchor when that still reads its quote,
 * else on its quote when the quote occurs exactly once in `text`, else detached. */
export function placeThreads(text: string, threads: CommentThread[]): Map<Uuid, Placement> {
  const placed = new Map<Uuid, Placement>();
  for (const thread of threads) {
    if (text.slice(thread.start, thread.end) === thread.quote) {
      placed.set(thread.conversation_id, { from: thread.start, to: thread.end });
      continue;
    }
    const at = text.indexOf(thread.quote);
    const once = at >= 0 && text.indexOf(thread.quote, at + 1) < 0;
    placed.set(thread.conversation_id, once ? { from: at, to: at + thread.quote.length } : null);
  }
  return placed;
}

/** Replaces the threads' placements, as when the document opens or a suggestion is accepted. */
export const setPlacements = StateEffect.define<Map<Uuid, Placement>>();

/** The threads' placements, moved with every edit. Text typed right before or right after a
 * passage stays outside it, and a passage deleted entirely detaches its thread. */
export const threadPlacements = StateField.define<Map<Uuid, Placement>>({
  create: () => new Map(),
  update(placements, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setPlacements)) return effect.value;
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

/** The anchors to save with the document: every placed thread's passage. A detached thread
 * keeps the anchor it had, so the next open can look for its quote again. */
export function savedAnchors(state: EditorState): Anchor[] {
  const anchors: Anchor[] = [];
  for (const [thread_id, placement] of state.field(threadPlacements)) {
    if (placement) anchors.push({ thread_id, start: placement.from, end: placement.to });
  }
  return anchors;
}
