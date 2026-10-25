import { describe, expect, it } from "vitest";
import { COLOR_FAMILIES, colorForHue, hueOf, miniMeColors } from "./palette";

describe("Mini-Me colours", () => {
  it("keeps a family's solid and ink and adds the tint of its hue", () => {
    const purple = COLOR_FAMILIES.find((f) => f.name === "Purple")!;
    expect(miniMeColors(purple)).toEqual({
      tint: "oklch(0.94 0.04 282)",
      solid: "#6E5BFF",
      ink: "#4A3AE0",
    });
  });

  it("derives all three colours from a custom hue", () => {
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
