import { describe, expect, it } from "vitest";
import { draftFromDoc, markdownSource, miniMeSuggestions, segments } from "./references";
import type { MiniMe } from "./types";

const scribe: MiniMe = {
  id: "m1",
  name: "Scribe",
  description: "",
  colors: { tint: "#E3DFFF", solid: "#6E5BFF", ink: "#4A3AE0" },
  avatar: { base: "long", face: "quiet" },
  group: "thinking",
  built_in: true,
};
describe("draftFromDoc", () => {
  const text = (value: string) => ({ type: "text", text: value });
  const reference = (attrs: object) => ({ type: "reference", attrs });
  const paragraph = (...content: object[]) => ({ type: "paragraph", content });
  const doc = (...content: object[]) => ({ type: "doc", content });

  it("puts each reference's label in the text with a Text Component over it", () => {
    const skeptic = { kind: "mini_me", id: "m1", label: "@Skeptic" };
    const sent = paragraph(text("Ask "), reference(skeptic), text(" about this"));
    const draft = draftFromDoc(doc(sent));
    expect(draft).toEqual({
      content: "Ask @Skeptic about this",
      text_components: [{ ...skeptic, start: 4, end: 12 }],
    });
  });

  it("turns hard breaks and paragraphs into line breaks", () => {
    const draft = draftFromDoc(
      doc(paragraph(text("one"), { type: "hardBreak" }, text("two")), paragraph(text("three"))),
    );
    expect(draft.content).toBe("one\ntwo\nthree");
  });

  it("counts offsets in UTF-16 code units", () => {
    const trial = { kind: "component", id: "c1", label: "$trial" };
    const draft = draftFromDoc(doc(paragraph(text("🥔 "), reference(trial))));
    expect(draft.text_components[0]).toMatchObject({ start: 3, end: 9 });
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
