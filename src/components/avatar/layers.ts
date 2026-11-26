// Every part SVG is exported from the same 280 × 280 Figma frame, so parts of different layers
// line up when stacked. Vite needs each glob as literals, so every layer spells out its own.

export interface LayerDefinition {
  /** The key of this layer's part in a Mini-Me's saved avatar. */
  name: string;
  label: string;
  required: boolean;
  /** How far the layer leans toward the pointer, in percent of the avatar's width. */
  lean: number;
  /** Each part's SVG markup, by file path. */
  files: Record<string, string>;
}

/** The avatar's layers, in drawing order. */
export const LAYER_DEFINITIONS: LayerDefinition[] = [
  {
    name: "base",
    label: "Base",
    required: true,
    lean: 0,
    files: import.meta.glob<string>("../../assets/avatar/bases/*.svg", {
      eager: true,
      query: "?raw",
      import: "default",
    }),
  },
  {
    name: "eyes",
    label: "Eyes",
    required: true,
    lean: 5.71,
    files: import.meta.glob<string>("../../assets/avatar/eyes/*.svg", {
      eager: true,
      query: "?raw",
      import: "default",
    }),
  },
  {
    name: "mouth",
    label: "Mouth",
    required: true,
    lean: 3.57,
    files: import.meta.glob<string>("../../assets/avatar/mouths/*.svg", {
      eager: true,
      query: "?raw",
      import: "default",
    }),
  },
  {
    name: "accessory",
    label: "Accessory",
    required: false,
    lean: 2,
    files: import.meta.glob<string>("../../assets/avatar/accessories/*.svg", {
      eager: true,
      query: "?raw",
      import: "default",
    }),
  },
  {
    name: "held",
    label: "Held item",
    required: false,
    lean: 0,
    files: import.meta.glob<string>("../../assets/avatar/held/*.svg", {
      eager: true,
      query: "?raw",
      import: "default",
    }),
  },
];
