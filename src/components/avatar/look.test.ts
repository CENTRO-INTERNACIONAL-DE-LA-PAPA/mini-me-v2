import { describe, expect, it } from "vitest";
import { lookOffset } from "./look";

describe("lookOffset", () => {
  const box = { left: 0, top: 0, width: 100, height: 100 };

  it("leans toward the pointer, more the farther it is, up to a limit", () => {
    expect(lookOffset({ x: 50, y: 50 }, box)).toEqual({ x: 0, y: 0 });
    const near = lookOffset({ x: 50, y: 100 }, box);
    expect(near.x).toBeCloseTo(0);
    expect(near.y).toBeCloseTo(1 / 6);
    const left = lookOffset({ x: -1000, y: 50 }, box);
    expect(left.x).toBeCloseTo(-1);
    expect(left.y).toBeCloseTo(0);
    expect(lookOffset({ x: -5000, y: 50 }, box).x).toBeCloseTo(-1);
  });
});
