import { describe, expect, it } from "vitest";
import { draftFromDoc, markdownSource } from "./references";

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
    const trial = { kind: "component", id: "c1", label: "$trial" };
    const emoji = draftFromDoc(doc(paragraph(text("🥔 "), reference(trial))));
    expect(emoji.text_components[0]).toMatchObject({ start: 3, end: 9 });
  });
});

describe("markdownSource", () => {
  const mention = { kind: "mini_me", id: "m1", label: "@Scribe", start: 4, end: 11 } as const;

  it("leaves a component whose range doesn't hold its label", () => {
    expect(markdownSource("ask @Scrabble", [mention])).toBe("ask @Scrabble");
  });
});
