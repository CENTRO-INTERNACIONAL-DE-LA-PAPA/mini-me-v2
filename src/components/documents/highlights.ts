import { StateEffect, StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import type { Uuid } from "../../protocol/types";
import { threadPlacements } from "./anchors";

/** Which threads the source shows (the open ones), which one is selected, and each one's
 * number in the document. */
export interface Highlighted {
  visible: ReadonlySet<Uuid>;
  selected: Uuid | null;
  numbers: ReadonlyMap<Uuid, number>;
}

export const setHighlighted = StateEffect.define<Highlighted>();

const highlighted = StateField.define<Highlighted>({
  create: () => ({ visible: new Set(), selected: null, numbers: new Map() }),
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setHighlighted)) return effect.value;
    }
    return value;
  },
});

/** A thread's number, right after its passage, as its row in the comments sheet shows it.
 * `data-thread` lets a click on it open the thread. */
class NumberBadge extends WidgetType {
  constructor(
    readonly thread: Uuid,
    readonly number: number,
  ) {
    super();
  }

  eq(other: NumberBadge) {
    return other.thread === this.thread && other.number === this.number;
  }

  toDOM() {
    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = "cm-comment-bubble";
    badge.dataset.thread = this.thread;
    badge.textContent = String(this.number);
    badge.setAttribute("aria-label", `Comment ${this.number}`);
    return badge;
  }

  ignoreEvent() {
    return false;
  }
}

const passage = Decoration.mark({ class: "cm-comment" });
const selectedPassage = Decoration.mark({ class: "cm-comment cm-comment-selected" });

function decorations(state: EditorState): DecorationSet {
  const { visible, selected, numbers } = state.field(highlighted);
  const marks: Range<Decoration>[] = [];
  for (const [id, placement] of state.field(threadPlacements)) {
    if (!placement || !visible.has(id)) continue;
    marks.push((id === selected ? selectedPassage : passage).range(placement.from, placement.to));
    const badge = new NumberBadge(id, numbers.get(id) ?? 0);
    marks.push(Decoration.widget({ widget: badge, side: 1 }).range(placement.to));
  }
  return Decoration.set(marks, true);
}

/** The threads' passages and number badges in the source, following their placements as the
 * user edits. */
export const threadHighlights = [
  highlighted,
  StateField.define<DecorationSet>({
    create: decorations,
    update: (marks, transaction) =>
      transaction.docChanged ||
      transaction.startState.field(highlighted) !== transaction.state.field(highlighted) ||
      transaction.startState.field(threadPlacements) !== transaction.state.field(threadPlacements)
        ? decorations(transaction.state)
        : marks,
    provide: (field) => EditorView.decorations.from(field),
  }),
  EditorView.theme({
    ".cm-comment": { borderBottom: "1px solid var(--border-strong)" },
    ".cm-comment-selected": { backgroundColor: "var(--accent)" },
    // The same badge as the thread's row in the comments sheet.
    ".cm-comment-bubble": {
      display: "inline-grid",
      placeItems: "center",
      minWidth: "18px",
      height: "18px",
      margin: "0 2px 0 4px",
      padding: "0 4px",
      verticalAlign: "1px",
      borderRadius: "5px",
      border: "1px solid var(--foreground)",
      backgroundColor: "var(--card)",
      color: "var(--foreground)",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-meta)",
      fontWeight: "600",
      lineHeight: "1",
      cursor: "pointer",
    },
  }),
];

/** The shown thread whose passage holds the position `at`, if any. */
export function threadAt(state: EditorState, at: number): Uuid | null {
  const { visible } = state.field(highlighted);
  for (const [id, placement] of state.field(threadPlacements)) {
    if (placement && visible.has(id) && placement.from <= at && at <= placement.to) return id;
  }
  return null;
}
