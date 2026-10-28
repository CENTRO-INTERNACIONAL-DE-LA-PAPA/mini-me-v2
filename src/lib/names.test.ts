import { describe, expect, it } from "vitest";
import { firstName, initials } from "./names";

describe("names", () => {
  it("takes the first word and the initials of the first and last words", () => {
    expect(firstName("Ana María Pérez")).toBe("Ana");
    expect(initials("Ana María Pérez")).toBe("AP");
  });

  it("takes one initial from a one-word name", () => {
    expect(initials("ana")).toBe("A");
  });

  it("gives nothing for an empty name", () => {
    expect(firstName(" ")).toBe("");
    expect(initials(" ")).toBe("");
  });
});
