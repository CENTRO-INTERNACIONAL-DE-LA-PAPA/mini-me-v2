import { describe, expect, it } from "vitest";
import { answerRows } from "./jevDebug";

describe("answerRows", () => {
  it("names questions in plain words and lists the other options highest first", () => {
    const rows = answerRows({
      mini_me: {
        choice: "plotter",
        confidence: 0.92,
        probabilities: { scribe: 0.03, plotter: 0.92, assistant: 0.05 },
      },
      tone: { choice: "calm", confidence: 0.6, probabilities: {} },
    });
    expect(rows).toEqual([
      {
        question: "Who answers?",
        choice: "plotter",
        confidence: 0.92,
        others: [
          { option: "assistant", probability: 0.05 },
          { option: "scribe", probability: 0.03 },
        ],
      },
      { question: "tone", choice: "calm", confidence: 0.6, others: [] },
    ]);
  });
});
