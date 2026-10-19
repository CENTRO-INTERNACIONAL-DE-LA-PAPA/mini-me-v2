import { describe, expect, it } from "vitest";
import {
  activeQuery,
  assetTarget,
  insertReference,
  miniMeTarget,
  segments,
  toTextComponents,
  updateReferences,
  type DraftReference,
} from "./references";
import type { AssetRef, MiniMe } from "./types";

const asset: AssetRef = { id: "a1", name: "trial.csv", media_type: "text/csv", size_bytes: 10 };
const scribe: MiniMe = {
  id: "m1",
  name: "Scribe",
  description: "",
  colors: { tint: "#E3DFFF", solid: "#6E5BFF", ink: "#4A3AE0" },
};

describe("activeQuery", () => {
  it("finds the #query before the cursor", () => {
    expect(activeQuery("see #tri", 8)).toEqual({ start: 4, query: "tri", kind: "asset" });
    expect(activeQuery("#", 1)).toEqual({ start: 0, query: "", kind: "asset" });
  });

  it("finds the @query for Mini-Mes", () => {
    expect(activeQuery("hi @scr", 7)).toEqual({ start: 3, query: "scr", kind: "mini_me" });
    expect(activeQuery("email@host", 10)).toBeNull();
  });

  it("ignores # inside a word or after a space", () => {
    expect(activeQuery("issue#3", 7)).toBeNull();
    expect(activeQuery("see #tri ", 9)).toBeNull();
  });
});

describe("insertReference", () => {
  it("replaces the query with the label and tracks its range", () => {
    const result = insertReference("see #tri now", [], 4, 8, assetTarget(asset));
    expect(result.text).toBe("see #trial.csv now");
    expect(result.references).toEqual([
      { kind: "asset", id: "a1", label: "#trial.csv", start: 4, end: 14 },
    ]);
    expect(result.cursor).toBe(15);
  });

  it("inserts a Mini-Me mention", () => {
    const result = insertReference("@Scr summarize", [], 0, 4, miniMeTarget(scribe));
    expect(result.text).toBe("@Scribe summarize");
    expect(result.references).toEqual([
      { kind: "mini_me", id: "m1", label: "@Scribe", start: 0, end: 7 },
    ]);
  });

  it("adds a space at the end of the text", () => {
    const result = insertReference("see #tri", [], 4, 8, assetTarget(asset));
    expect(result.text).toBe("see #trial.csv ");
    expect(result.cursor).toBe(15);
  });

  it("puts the cursor after an existing space", () => {
    const result = insertReference("@Scr summarize", [], 0, 4, miniMeTarget(scribe));
    expect(result.cursor).toBe(8);
  });

  it("shifts references that come after the insertion", () => {
    const first = insertReference("# and #", [], 6, 7, assetTarget(asset));
    const second = insertReference(first.text, first.references, 0, 1, assetTarget(asset));
    expect(second.references.map((r) => [r.start, r.end])).toEqual([
      [0, 10],
      [15, 25],
    ]);
  });
});

describe("updateReferences", () => {
  const ref: DraftReference = { kind: "asset", id: "a1", label: "#trial.csv", start: 4, end: 14 };
  const text = "see #trial.csv now";

  it("keeps references before an edit", () => {
    expect(updateReferences(text, text + "!", [ref])).toEqual([ref]);
  });

  it("shifts references after an edit", () => {
    expect(updateReferences(text, "please " + text, [ref])).toEqual([
      { ...ref, start: 11, end: 21 },
    ]);
  });

  it("drops a reference when the edit touches it", () => {
    expect(updateReferences(text, "see #trial.cv now", [ref])).toEqual([]);
  });
});

describe("rendering helpers", () => {
  it("converts drafts to text components", () => {
    const components = toTextComponents([
      { kind: "asset", id: "a1", label: "#x", start: 0, end: 2 },
      { kind: "mini_me", id: "m1", label: "@Scribe", start: 3, end: 10 },
    ]);
    expect(components).toEqual([
      { kind: "asset", id: "a1", label: "#x", start: 0, end: 2 },
      { kind: "mini_me", id: "m1", label: "@Scribe", start: 3, end: 10 },
    ]);
  });

  it("splits content around references", () => {
    const [component] = toTextComponents([
      { kind: "asset", id: "a1", label: "#x", start: 4, end: 6 },
    ]);
    expect(segments("see #x now", [component]).map((s) => s.text)).toEqual(["see ", "#x", " now"]);
  });
});
