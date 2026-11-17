import { StateEffect, StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import type { MiniMeColors, Uuid } from "../../protocol/types";
import { suggestionPlacements, threadPlacements } from "./anchors";

/** Which threads the source shows (the open ones), which one is selected, each one's number in
 * the document, and the waiting suggestions by ID. */
interface Highlighted {
  visible: ReadonlySet<Uuid>;
  selected: Uuid | null;
  numbers: ReadonlyMap<Uuid, number>;
  suggestions: ReadonlyMap<Uuid, Suggested>;
}

/** A waiting suggestion's text, in the colours of the Mini-Me that suggested it. */
export interface Suggested {
  text: string;
  colors?: MiniMeColors;
}

export const setHighlighted = StateEffect.define<Highlighted>();

const highlighted = StateField.define<Highlighted>({
  create: () => ({
    visible: new Set(),
    selected: null,
    numbers: new Map(),
    suggestions: new Map(),
  }),
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

/** A waiting suggestion's text right after the passage it would replace, underlined in its
 * Mini-Me's colour. `data-suggestion` lets a click on it offer Accept and Discard. */
class SuggestedText extends WidgetType {
  constructor(
    readonly id: Uuid,
    readonly suggested: Suggested,
  ) {
    super();
  }

  eq(other: SuggestedText) {
    return (
      other.id === this.id &&
      other.suggested.text === this.suggested.text &&
      other.suggested.colors?.solid === this.suggested.colors?.solid
    );
  }

  toDOM() {
    const text = document.createElement("span");
    text.className = "cm-suggested";
    text.dataset.suggestion = this.id;
    text.textContent = this.suggested.text;
    const { colors } = this.suggested;
    if (colors) {
      text.style.color = colors.ink;
      text.style.textDecorationColor = colors.solid;
    }
    return text;
  }

  ignoreEvent() {
    return false;
  }
}

function decorations(state: EditorState): DecorationSet {
  const { visible, selected, numbers, suggestions } = state.field(highlighted);
  const marks: Range<Decoration>[] = [];
  for (const [id, placement] of state.field(threadPlacements)) {
    if (!placement || !visible.has(id)) continue;
    const classes = ["cm-comment"];
    if (id === selected) classes.push("cm-comment-selected");
    marks.push(Decoration.mark({ class: classes.join(" ") }).range(placement.from, placement.to));
    const badge = new NumberBadge(id, numbers.get(id) ?? 0);
    marks.push(Decoration.widget({ widget: badge, side: 2 }).range(placement.to));
  }
  for (const [id, placement] of state.field(suggestionPlacements)) {
    const suggested = suggestions.get(id);
    if (!placement || !suggested) continue;
    const replaced = Decoration.mark({ class: "cm-suggestion-replaced" });
    marks.push(replaced.range(placement.from, placement.to));
    const widget = new SuggestedText(id, suggested);
    marks.push(Decoration.widget({ widget, side: 1 }).range(placement.to));
  }
  return Decoration.set(marks, true);
}

/** The threads' passages and number badges, and the waiting suggestions, in the source,
 * following their placements. */
export const threadHighlights = [
  highlighted,
  StateField.define<DecorationSet>({
    create: decorations,
    update: (marks, transaction) =>
      transaction.docChanged ||
      transaction.startState.field(highlighted) !== transaction.state.field(highlighted) ||
      transaction.startState.field(threadPlacements) !==
        transaction.state.field(threadPlacements) ||
      transaction.startState.field(suggestionPlacements) !==
        transaction.state.field(suggestionPlacements)
        ? decorations(transaction.state)
        : marks,
    provide: (field) => EditorView.decorations.from(field),
  }),
  EditorView.theme({
    ".cm-comment": { borderBottom: "1px solid var(--border-strong)" },
    ".cm-comment-selected": { backgroundColor: "var(--accent)" },
    ".cm-suggestion-replaced": { textDecoration: "line-through", cursor: "pointer" },
    ".cm-suggested": {
      cursor: "pointer",
      marginLeft: "4px",
      textDecoration: "underline",
      textDecorationThickness: "2px",
      textUnderlineOffset: "3px",
    },
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

/** The shown suggestion whose passage holds the position `at`, if any. */
export function suggestionAt(state: EditorState, at: number): Uuid | null {
  const { suggestions } = state.field(highlighted);
  for (const [id, placement] of state.field(suggestionPlacements)) {
    if (placement && suggestions.has(id) && placement.from <= at && at <= placement.to) return id;
  }
  return null;
}
