import { describe, expect, it } from "vitest";
import { hexToOklch, oklchToHex, surfaceColors } from "./miniMeColors";

describe("surfaceColors", () => {
  it("round-trips a colour through OKLCH", () => {
    expect(oklchToHex(hexToOklch("#6e5bff"))).toBe("#6e5bff");
  });

  it("derives a light wash and a stronger edge in the solid's hue", () => {
    const { wash, edge } = surfaceColors({ tint: "#E3DFFF", solid: "#6E5BFF", ink: "#4A3AE0" });
    const [washL, , washH] = hexToOklch(wash);
    const [edgeL] = hexToOklch(edge);
    const [, , solidH] = hexToOklch("#6E5BFF");
    expect(washL).toBeCloseTo(0.985, 2);
    expect(edgeL).toBeCloseTo(0.86, 2);
    expect(Math.abs(washH - solidH)).toBeLessThan(5);
  });
});
