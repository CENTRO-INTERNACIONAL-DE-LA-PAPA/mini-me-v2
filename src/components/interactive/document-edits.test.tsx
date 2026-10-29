import { describe, expect, it } from "vitest";
import { editsWaiting } from "./document-edits";

describe("document-edits version 1", () => {
  it("counts the suggested edits still waiting", () => {
    expect(editsWaiting(null, 3)).toBe("3 suggested edits");
    expect(editsWaiting(2, 3)).toBe("2 of 3 suggested edits waiting");
    expect(editsWaiting(0, 3)).toBe("All 3 suggested edits answered");
    expect(editsWaiting(1, 1)).toBe("1 of 1 suggested edit waiting");
    expect(editsWaiting(0, 1)).toBe("Suggested edit answered");
  });
});
