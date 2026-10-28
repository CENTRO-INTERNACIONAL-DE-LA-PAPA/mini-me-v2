import { describe, expect, it } from "vitest";
import { copyName, nextStepId } from "./library";

describe("copyName", () => {
  it("adds Copy, then the smallest free number", () => {
    expect(copyName("Plan", ["Plan"])).toBe("Plan Copy");
    expect(copyName("Plan", ["Plan", "plan copy"])).toBe("Plan Copy 2");
    expect(copyName("Plan", ["Plan Copy", "Plan Copy 2"])).toBe("Plan Copy 3");
  });
});

describe("nextStepId", () => {
  it("uses the Trait name in kebab-case, numbered when taken", () => {
    expect(nextStepId("Find Papers", [])).toBe("find-papers");
    expect(nextStepId("Plan", ["plan"])).toBe("plan-2");
    expect(nextStepId("Plan", ["plan", "plan-2"])).toBe("plan-3");
  });
});
