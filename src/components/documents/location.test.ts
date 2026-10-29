import { describe, expect, it } from "vitest";
import { passageLocation } from "./location";

const TEXT = [
  "Before any heading.",
  "# Request",
  "Find papers.",
  "## Hypothesis",
  "- First point",
  "- Second point",
  "- The threshold is a placeholder.",
].join("\n");

describe("passage location", () => {
  it("names the section, and the bullet when the passage starts in one", () => {
    expect(passageLocation(TEXT, TEXT.indexOf("papers"))).toBe("Request");
    expect(passageLocation(TEXT, TEXT.indexOf("threshold"))).toBe("Hypothesis, bullet 3");
    expect(passageLocation(TEXT, TEXT.indexOf("Hypothesis"))).toBe("Hypothesis");
  });

  it("gives nothing before the first heading", () => {
    expect(passageLocation(TEXT, 3)).toBeNull();
  });
});
