import { describe, expect, it } from "vitest";
import {
  activeQuery,
  assetTarget,
  caretStep,
  draftMessage,
  insertReference,
  markdownSource,
  miniMeTarget,
  miniMeSuggestions,
  segments,
  updateReferences,
  PILL_PAD as P,
  type DraftReference,
} from "./references";
import type { AssetRef, MiniMe } from "./types";

const asset: AssetRef = { id: "a1", name: "trial.csv", media_type: "text/csv", size_bytes: 10 };
const scribe: MiniMe = {
  id: "m1",
  name: "Scribe",
  description: "",
  colors: { tint: "#E3DFFF", solid: "#6E5BFF", ink: "#4A3AE0" },
  group: "thinking",
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
  it("replaces the query with the padded label and tracks its range", () => {
    const result = insertReference("see #tri now", [], 4, 8, assetTarget(asset));
    expect(result.text).toBe(`see ${P}#trial.csv${P} now`);
    expect(result.references).toEqual([
      { kind: "asset", id: "a1", label: "#trial.csv", start: 4, end: 16 },
    ]);
    expect(result.cursor).toBe(17);
  });

  it("inserts a Mini-Me mention", () => {
    const result = insertReference("@Scr summarize", [], 0, 4, miniMeTarget(scribe));
    expect(result.text).toBe(`${P}@Scribe${P} summarize`);
    expect(result.references).toEqual([
      { kind: "mini_me", id: "m1", label: "@Scribe", start: 0, end: 9 },
    ]);
  });

  it("adds a space at the end of the text", () => {
    const result = insertReference("see #tri", [], 4, 8, assetTarget(asset));
    expect(result.text).toBe(`see ${P}#trial.csv${P} `);
    expect(result.cursor).toBe(17);
  });

  it("adds a space before a line break", () => {
    const result = insertReference("#tri\nnext", [], 0, 4, assetTarget(asset));
    expect(result.text).toBe(`${P}#trial.csv${P} \nnext`);
    expect(result.cursor).toBe(13);
  });

  it("puts the cursor after an existing space", () => {
    const result = insertReference("@Scr summarize", [], 0, 4, miniMeTarget(scribe));
    expect(result.cursor).toBe(10);
  });

  it("shifts references that come after the insertion", () => {
    const first = insertReference("# and #", [], 6, 7, assetTarget(asset));
    const second = insertReference(first.text, first.references, 0, 1, assetTarget(asset));
    expect(second.references.map((r) => [r.start, r.end])).toEqual([
      [0, 12],
      [17, 29],
    ]);
  });
});

describe("pills as blocks", () => {
  const { text, references } = insertReference("ask @Scr", [], 4, 8, miniMeTarget(scribe));

  it("steps the caret over a whole pill", () => {
    expect(caretStep(references, 13, -1)).toBe(4);
    expect(caretStep(references, 4, 1)).toBe(13);
    expect(caretStep(references, 4, -1)).toBe(3);
  });

  it("sends the text without padding", () => {
    const second = { ...references[0], start: 21, end: 30 };
    expect(draftMessage(`${text}hi ${text}`, [references[0], second])).toEqual({
      content: "ask @Scribe hi ask @Scribe ",
      text_components: [
        { kind: "mini_me", id: "m1", label: "@Scribe", start: 4, end: 11 },
        { kind: "mini_me", id: "m1", label: "@Scribe", start: 19, end: 26 },
      ],
    });
  });

  it("sends a space where padding alone separated a pill from other text", () => {
    const pill = { kind: "mini_me", id: "m1", label: "@Scribe", start: 0, end: 9 } as const;
    const file = { kind: "asset", id: "a1", label: "#x", start: 9, end: 13 } as const;
    expect(draftMessage(`${P}@Scribe${P}hi`, [pill]).content).toBe("@Scribe hi");
    expect(draftMessage(`${P}@Scribe${P}${P}#x${P}`, [pill, file]).content).toBe("@Scribe #x");
  });

  it("keeps narrow spaces that aren't padding", () => {
    expect(draftMessage(`10${P}kg`, []).content).toBe(`10${P}kg`);
  });

  it("adds a space before a following pill", () => {
    const pill = { ...references[0], start: 4, end: 13 };
    const result = insertReference(`#tri${text.slice(4)}`, [pill], 0, 4, assetTarget(asset));
    expect(draftMessage(result.text, result.references).content).toBe("#trial.csv @Scribe ");
    expect(result.cursor).toBe(13);
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
  it("splits content around references", () => {
    const component = { kind: "asset", id: "a1", label: "#x", start: 4, end: 6 } as const;
    expect(segments("see #x now", [component]).map((s) => s.text)).toEqual(["see ", "#x", " now"]);
  });
});

describe("markdownSource", () => {
  const mention = { kind: "mini_me", id: "m1", label: "@Scribe", start: 4, end: 11 } as const;

  it("turns Text Components into ref links", () => {
    const file = { kind: "asset", id: "a1", label: "#trial.csv", start: 18, end: 28 } as const;
    expect(markdownSource("ask @Scribe about #trial.csv", [mention, file])).toBe(
      "ask [@Scribe](ref:0) about [#trial.csv](ref:1)",
    );
  });

  it("escapes brackets in a label", () => {
    const file = { kind: "asset", id: "a1", label: "#a]b.csv", start: 0, end: 8 } as const;
    expect(markdownSource("#a]b.csv", [file])).toBe("[#a\\]b.csv](ref:0)");
  });

  it("leaves a component whose range doesn't hold its label", () => {
    expect(markdownSource("ask @Scrabble", [mention])).toBe("ask @Scrabble");
  });

  it("escapes a ! right before a component, so it stays a link", () => {
    const file = { kind: "asset", id: "a1", label: "#trial.csv", start: 5, end: 15 } as const;
    expect(markdownSource("Look!#trial.csv", [file])).toBe("Look\\![#trial.csv](ref:0)");
  });
});

describe("miniMeSuggestions", () => {
  const miniMe = (name: string, group: MiniMe["group"]): MiniMe => ({
    ...scribe,
    id: name,
    name,
    group,
  });
  const all = [
    miniMe("Profiler", "data"),
    miniMe("Researcher", "literature"),
    miniMe("Skeptic", "thinking"),
    miniMe("Explorer", "thinking"),
  ];
  const names = (query: string) =>
    miniMeSuggestions(all, query).map((s) => [s.label, s.miniMes.map((m) => m.name)]);

  it("groups every Mini-Me for an empty query", () => {
    expect(names("")).toEqual([
      ["Thinking", ["Skeptic", "Explorer"]],
      ["Literature", ["Researcher"]],
      ["Data", ["Profiler"]],
    ]);
  });

  it("narrows by name, leaving out empty groups", () => {
    expect(names("pro")).toEqual([["Data", ["Profiler"]]]);
  });

  it("ignores case and accents", () => {
    expect(names("SKÉP")).toEqual([["Thinking", ["Skeptic"]]]);
  });
});
