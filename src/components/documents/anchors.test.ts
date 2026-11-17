import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import type { CommentThread, Suggestion } from "../../protocol/types";
import {
  placeSuggestions,
  placeThreads,
  savedAnchors,
  setSuggestionPlacements,
  setThreadPlacements,
  suggestionPlacements,
  threadPlacements,
} from "./anchors";

const thread = (id: string, start: number, end: number, quote: string): CommentThread => ({
  conversation_id: id,
  asset_id: "doc",
  start,
  end,
  quote,
  resolved: false,
  created_at: 0,
  comments: 0,
});

const suggestion = (id: string, start: number, end: number, quote: string): Suggestion => ({
  id,
  asset_id: "doc",
  start,
  end,
  quote,
  base: quote,
  text: "x",
  author: { kind: "mini_me", id: "scribe" },
  created_at: 0,
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

  it("follows passages through edits around them and detaches them when deleted", () => {
    const extensions = [threadPlacements, suggestionPlacements];
    const start = EditorState.create({ doc: TEXT, extensions });
    const placed = start.update({
      effects: [
        setThreadPlacements.of(placeThreads(TEXT, [thread("t", 11, 24, "above 3,800 m")])),
        setSuggestionPlacements.of(placeSuggestions(TEXT, [suggestion("s", 0, 5, "Yield")])),
      ],
    }).state;

    const typed = placed.update({
      changes: [
        { from: 0, insert: "Sadly, " },
        { from: 24, insert: "!" },
      ],
    });
    expect(savedAnchors(typed.state)).toEqual({
      threads: [{ id: "t", start: 18, end: 31 }],
      suggestions: [{ id: "s", start: 7, end: 12 }],
    });
    expect(typed.state.sliceDoc(18, 31)).toBe("above 3,800 m");

    const deleted = typed.state.update({ changes: [{ from: 7, to: 12 }, { from: 18, to: 31 }] })
      .state;
    expect(deleted.field(threadPlacements).get("t")).toBeNull();
    expect(deleted.field(suggestionPlacements).get("s")).toBeNull();
    expect(savedAnchors(deleted)).toEqual({ threads: [], suggestions: [] });
  });
});
