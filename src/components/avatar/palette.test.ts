import { describe, expect, it } from "vitest";
import { COLOR_FAMILIES, colorForHue, hueOf, miniMeColors, tintForHue } from "./palette";

describe("Mini-Me colours", () => {
  it("keeps a family's solid and ink with its hue's tint, or derives all from a custom hue", () => {
    const family = COLOR_FAMILIES[0];
    expect(miniMeColors(family)).toEqual({
      tint: tintForHue(family.hue),
      solid: family.solid,
      ink: family.ink,
    });
    expect(miniMeColors({ hue: 120, ...colorForHue(120) })).toEqual({
      tint: "oklch(0.94 0.04 120)",
      solid: "oklch(0.66 0.15 120)",
      ink: "oklch(0.46 0.11 120)",
    });
  });

  it("finds the hue colours were picked at", () => {
    expect(hueOf(miniMeColors({ hue: 120, ...colorForHue(120) }))).toBe(120);
    expect(hueOf({ tint: "#E3DFFF", solid: "#6e5bff", ink: "#4A3AE0" })).toBe(282);
    expect(hueOf({ tint: "#D6F1EE", solid: "#1F9E8F", ink: "#12675D" })).toBeNull();
  });
});
