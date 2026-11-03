import { describe, expect, it } from "vitest";
import { statusLabel } from "./conversationStatus";

describe("statusLabel", () => {
  const mini_me = { id: "m1", name: "Researcher" };

  it("says what the reply is doing", () => {
    expect(statusLabel({ kind: "running", mini_me })).toBe("Running");
    expect(statusLabel({ kind: "needs_approval", mini_me })).toBe("Needs your approval");
  });
});
