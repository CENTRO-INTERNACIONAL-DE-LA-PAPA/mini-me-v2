import { describe, expect, it } from "vitest";
import { editsLabel } from "./document-edits";

describe("document-edits version 1", () => {
  it("counts the suggested edits still waiting", () => {
    expect(editsLabel(null, 3)).toBe("3 suggested edits");
    expect(editsLabel(2, 3)).toBe("2 of 3 suggested edits waiting");
    expect(editsLabel(0, 3)).toBe("All 3 suggested edits answered");
    expect(editsLabel(1, 1)).toBe("1 of 1 suggested edit waiting");
    expect(editsLabel(0, 1)).toBe("Suggested edit answered");
  });
});
