// Avatar colours follow the Mini-Me colour families in DESIGN.md: a solid for the body
// and an ink for the freckles. Custom hues keep oklch lightness and chroma fixed, so any
// hue gives a colour in the same tone as the families.
const SOLID = { lightness: 0.66, chroma: 0.15 };
const INK = { lightness: 0.46, chroma: 0.11 };

export interface AvatarColor {
  solid: string;
  ink: string;
}

export const colorForHue = (hue: number): AvatarColor => ({
  solid: `oklch(${SOLID.lightness} ${SOLID.chroma} ${hue})`,
  ink: `oklch(${INK.lightness} ${INK.chroma} ${hue})`,
});

export interface ColorFamily extends AvatarColor {
  name: string;
  hue: number;
}

const family = (name: string, hue: number): ColorFamily => ({ name, hue, ...colorForHue(hue) });

export const COLOR_FAMILIES: ColorFamily[] = [
  { name: "Red", hue: 34, solid: "#FF5A36", ink: "#B3300F" },
  family("Brown", 55),
  { name: "Yellow", hue: 84, solid: "#F5B800", ink: "#7A5A00" },
  { name: "Green", hue: 158, solid: "#2FA36B", ink: "#1E7A4A" },
  family("Teal", 205),
  family("Blue", 250),
  { name: "Purple", hue: 282, solid: "#6E5BFF", ink: "#4A3AE0" },
  family("Pink", 350),
];

/** A CSS gradient of the solid tone across every hue, for a hue slider's track. */
export const SOLID_HUE_GRADIENT = `linear-gradient(to right, ${Array.from(
  { length: 13 },
  (_, i) => colorForHue(i * 30).solid,
).join(", ")})`;
