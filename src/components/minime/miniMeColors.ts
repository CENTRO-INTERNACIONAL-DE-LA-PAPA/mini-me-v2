import type { CSSProperties } from "react";
import type { MiniMeColors } from "../../protocol/types";

/** A Mini-Me's colours on the surfaces it owns: its stored `tint`, `solid` and `ink`, plus a
 * very light `wash` for its replies and cards and an `edge` for borders on that wash. */
export interface SurfaceColors extends MiniMeColors {
  wash: string;
  edge: string;
}

type Oklch = [l: number, c: number, h: number];

function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function fromLinear(channel: number): number {
  return channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
}

/** `#rrggbb` in OKLCH, with the hue in degrees. */
export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const hue = (Math.atan2(B, A) * 180) / Math.PI;
  return [L, Math.hypot(A, B), hue < 0 ? hue + 360 : hue];
}

/** An OKLCH colour as `#rrggbb`, clipped into sRGB. */
export function oklchToHex([L, C, h]: Oklch): string {
  const A = C * Math.cos((h * Math.PI) / 180);
  const B = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return (
    "#" +
    rgb
      .map((c) => Math.round(Math.min(1, Math.max(0, fromLinear(c))) * 255))
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("")
  );
}

/** A Mini-Me's surface colours: `wash` and `edge` take the hue of its `solid`, at the
 * lightness and chroma DESIGN.md gives for them. */
export function surfaceColors(colors: MiniMeColors): SurfaceColors {
  const [, , hue] = hexToOklch(colors.solid);
  return {
    ...colors,
    wash: oklchToHex([0.985, 0.015, hue]),
    edge: oklchToHex([0.86, 0.07, hue]),
  };
}

/** The colours as CSS variables (`--mm-tint`, `--mm-solid`, `--mm-ink`, `--mm-wash`,
 * `--mm-edge`), for a surface that takes a Mini-Me's colour and the elements inside it. */
export function surfaceStyle(colors: MiniMeColors | undefined): CSSProperties | undefined {
  if (!colors) return undefined;
  const { tint, solid, ink, wash, edge } = surfaceColors(colors);
  return {
    "--mm-tint": tint,
    "--mm-solid": solid,
    "--mm-ink": ink,
    "--mm-wash": wash,
    "--mm-edge": edge,
  } as CSSProperties;
}
