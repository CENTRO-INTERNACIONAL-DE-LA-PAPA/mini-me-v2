import { describe, expect, it } from "vitest";
import { isClick } from "./gesture";

const at = (x: number, y: number, t: number) => ({ x, y, at: t });

describe("isClick", () => {
  it("counts a short, still press as a click", () => {
    expect(isClick(at(10, 10, 0), at(12, 11, 150))).toBe(true);
  });

  it("counts a press that moves as a drag", () => {
    expect(isClick(at(10, 10, 0), at(30, 10, 100))).toBe(false);
  });

  it("counts a long press as a drag", () => {
    expect(isClick(at(10, 10, 0), at(10, 10, 800))).toBe(false);
  });
});
