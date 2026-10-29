import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { prefixSpec, wrapSpec } from "./sourceEdits";

const state = (doc: string, from: number, to = from) =>
  EditorState.create({ doc, selection: EditorSelection.single(from, to) });

const apply = (start: EditorState, spec: ReturnType<typeof wrapSpec>) =>
  start.update(spec).state;

describe("source edits", () => {
  it("wraps the selection in a mark, and unwraps it again", () => {
    const bold = apply(state("yield 212 kg", 6, 9), wrapSpec(state("yield 212 kg", 6, 9), "**"));
    expect(bold.doc.toString()).toBe("yield **212** kg");
    expect(bold.sliceDoc(bold.selection.main.from, bold.selection.main.to)).toBe("212");
    expect(apply(bold, wrapSpec(bold, "**")).doc.toString()).toBe("yield 212 kg");
  });

  it("puts the cursor between new marks when nothing is selected", () => {
    const next = apply(state("a ", 2), wrapSpec(state("a ", 2), "*"));
    expect(next.doc.toString()).toBe("a **");
    expect(next.selection.main.from).toBe(3);
  });

  it("prefixes every selected line, replacing another marker, and removes it again", () => {
    const doc = "# Old\nsecond\n> quoted";
    const start = state(doc, 0, doc.length);
    const heading = apply(start, prefixSpec(start, "## "));
    expect(heading.doc.toString()).toBe("## Old\n## second\n## quoted");
    const all = heading.update({ selection: { anchor: 0, head: heading.doc.length } }).state;
    const plain = apply(all, prefixSpec(all, "## "));
    expect(plain.doc.toString()).toBe("Old\nsecond\nquoted");
  });
});
