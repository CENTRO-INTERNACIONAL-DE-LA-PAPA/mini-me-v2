import type { EditorState, TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/** Puts `mark` on both sides of the selection, or takes it off when it is already there; with
 * nothing selected it inserts a pair of marks with the cursor between them. */
export function wrapSpec(state: EditorState, mark: string): TransactionSpec {
  const { from, to } = state.selection.main;
  const before = state.sliceDoc(Math.max(0, from - mark.length), from);
  const after = state.sliceDoc(to, to + mark.length);
  if (before === mark && after === mark) {
    return {
      changes: [
        { from: from - mark.length, to: from },
        { from: to, to: to + mark.length },
      ],
      selection: { anchor: from - mark.length, head: to - mark.length },
    };
  }
  return {
    changes: [
      { from, insert: mark },
      { from: to, insert: mark },
    ],
    selection: { anchor: from + mark.length, head: to + mark.length },
  };
}

/** Starts every selected line with `prefix` (such as "## " or "- "), replacing another heading,
 * quote or list marker; when all of them already start with it, removes it. */
export function prefixSpec(state: EditorState, prefix: string): TransactionSpec {
  const { from, to } = state.selection.main;
  const first = state.doc.lineAt(from).number;
  const last = state.doc.lineAt(to).number;
  const lines = Array.from({ length: last - first + 1 }, (_, i) => state.doc.line(first + i));
  const marker = /^(#{1,6} |> |[-*+] )/;
  const removing = lines.every((line) => line.text.startsWith(prefix));
  return {
    changes: lines.map((line) => {
      const existing = marker.exec(line.text)?.[0] ?? "";
      return {
        from: line.from,
        to: line.from + existing.length,
        insert: removing ? "" : prefix,
      };
    }),
  };
}

export const wrapSelection = (view: EditorView, mark: string) =>
  view.dispatch(wrapSpec(view.state, mark));

export const blockPrefix = (view: EditorView, prefix: string) =>
  view.dispatch(prefixSpec(view.state, prefix));
