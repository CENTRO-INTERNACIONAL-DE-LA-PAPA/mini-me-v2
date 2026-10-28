// Every part SVG shares the viewBox "-2 -4 28 28", so a base, a face and an
// accessory drawn in the same box line up when stacked. Base SVGs colour their body and
// freckles with the CSS variables --avatar-solid and --avatar-ink, falling back to yellow.

export interface AvatarPart {
  id: string;
  label: string;
  url: string;
}

// "../../assets/avatar/bases/red-bliss.svg" -> "red-bliss"
const fileStem = (path: string) => path.slice(path.lastIndexOf("/") + 1, -".svg".length);

const glob = (urls: Record<string, string>): AvatarPart[] =>
  Object.entries(urls)
    .map(([path, url]) => {
      const id = fileStem(path);
      return { id, label: id.replace(/-/g, " "), url };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

export const BASES = glob(
  import.meta.glob<string>("../../assets/avatar/bases/*.svg", {
    eager: true,
    query: "?url",
    import: "default",
  }),
);
export const FACES = glob(
  import.meta.glob<string>("../../assets/avatar/faces/*.svg", {
    eager: true,
    query: "?url",
    import: "default",
  }),
);
export const ACCESSORIES = glob(
  import.meta.glob<string>("../../assets/avatar/accessories/*.svg", {
    eager: true,
    query: "?url",
    import: "default",
  }),
);

// Bases are inlined rather than drawn with <img>, so the CSS variables reach them. The
// size class fills the avatar's box and keeps Button's default svg sizing from applying.
const BASE_MARKUP = new Map(
  Object.entries(
    import.meta.glob<string>("../../assets/avatar/bases/*.svg", {
      eager: true,
      query: "?raw",
      import: "default",
    }),
  ).map(([path, markup]) => [fileStem(path), markup.replace("<svg ", '<svg class="size-full" ')]),
);

export const partUrl = (parts: AvatarPart[], id: string | null | undefined) =>
  parts.find((p) => p.id === id)?.url ?? null;

export const baseMarkup = (id: string) => BASE_MARKUP.get(id) ?? null;
