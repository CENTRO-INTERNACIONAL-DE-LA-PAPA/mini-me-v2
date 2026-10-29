import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import type { CommentThread } from "../../protocol/types";
import { placeThreads, savedAnchors, setPlacements, threadPlacements } from "./anchors";

const thread = (id: string, start: number, end: number, quote: string): CommentThread => ({
  conversation_id: id,
  asset_id: "doc",
  start,
  end,
  quote,
  resolved: false,
  created_at: 0,
  comments: 0,
  pending: null,
  opened_from: null,
});

const TEXT = "Yield fell above 3,800 m. Next steps.";

describe("anchors", () => {
  it("keeps a thread on its anchor, finds a moved passage, and detaches the rest", () => {
    const placed = placeThreads(TEXT, [
      thread("kept", 11, 24, "above 3,800 m"),
      thread("moved", 0, 4, "Next steps"),
      thread("gone", 0, 5, "Huancayo"),
      thread("twice", 0, 3, "e"),
    ]);
    expect(placed.get("kept")).toEqual({ from: 11, to: 24 });
    expect(placed.get("moved")).toEqual({ from: 26, to: 36 });
    expect(placed.get("gone")).toBeNull();
    expect(placed.get("twice")).toBeNull();
  });

  it("follows the passage through edits around it and detaches it when it is deleted", () => {
    const start = EditorState.create({ doc: TEXT, extensions: threadPlacements });
    const placed = start.update({
      effects: setPlacements.of(placeThreads(TEXT, [thread("t", 11, 24, "above 3,800 m")])),
    }).state;

    const typed = placed.update({
      changes: [
        { from: 0, insert: "Sadly, " },
        { from: 24, insert: "!" },
      ],
    });
    expect(savedAnchors(typed.state)).toEqual([{ thread_id: "t", start: 18, end: 31 }]);
    expect(typed.state.sliceDoc(18, 31)).toBe("above 3,800 m");

    const deleted = typed.state.update({ changes: { from: 18, to: 31 } }).state;
    expect(deleted.field(threadPlacements).get("t")).toBeNull();
    expect(savedAnchors(deleted)).toEqual([]);
  });
});
