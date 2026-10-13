import { describe, expect, it } from "vitest";
import {
  activeQuery,
  insertReference,
  segments,
  toTextComponents,
  updateReferences,
  type DraftReference,
} from "./references";
import type { AssetRef } from "./types";

const asset: AssetRef = { id: "a1", name: "trial.csv", media_type: "text/csv", size_bytes: 10 };

describe("activeQuery", () => {
  it("finds the #query before the cursor", () => {
    expect(activeQuery("see #tri", 8)).toEqual({ start: 4, query: "tri" });
    expect(activeQuery("#", 1)).toEqual({ start: 0, query: "" });
  });

  it("ignores # inside a word or after a space", () => {
    expect(activeQuery("issue#3", 7)).toBeNull();
    expect(activeQuery("see #tri ", 9)).toBeNull();
  });
});

describe("insertReference", () => {
  it("replaces the query with the label and tracks its range", () => {
    const result = insertReference("see #tri now", [], 4, 8, asset);
    expect(result.text).toBe("see #trial.csv  now");
    expect(result.references).toEqual([{ id: "a1", label: "#trial.csv", start: 4, end: 14 }]);
    expect(result.cursor).toBe(15);
  });

  it("shifts references that come after the insertion", () => {
    const first = insertReference("# and #", [], 6, 7, asset);
    const second = insertReference(first.text, first.references, 0, 1, asset);
    expect(second.references.map((r) => [r.start, r.end])).toEqual([
      [0, 10],
      [16, 26],
    ]);
  });
});

describe("updateReferences", () => {
  const ref: DraftReference = { id: "a1", label: "#trial.csv", start: 4, end: 14 };
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
    const [component] = toTextComponents([{ id: "a1", label: "#x", start: 0, end: 2 }]);
    expect(component.kind).toBe("asset");
  });

  it("splits content around references", () => {
    const [component] = toTextComponents([{ id: "a1", label: "#x", start: 4, end: 6 }]);
    expect(segments("see #x now", [component]).map((s) => s.text)).toEqual(["see ", "#x", " now"]);
  });
});
