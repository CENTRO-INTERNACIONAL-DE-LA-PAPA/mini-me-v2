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

export interface AvatarParts {
  base: string;
  face: string;
  accessory?: string | null;
}

// Bases and faces are inlined rather than drawn with <img>, so the CSS variables reach the bases
// and the animations reach the faces' eyes. The size class fills the avatar's box and keeps
// Button's default svg sizing from applying.
const inlined = (markups: Record<string, string>) =>
  new Map(
    Object.entries(markups).map(([path, markup]) => [
      fileStem(path),
      markup.replace("<svg ", '<svg class="size-full" '),
    ]),
  );
const BASE_MARKUP = inlined(
  import.meta.glob<string>("../../assets/avatar/bases/*.svg", {
    eager: true,
    query: "?raw",
    import: "default",
  }),
);
const FACE_MARKUP = inlined(
  import.meta.glob<string>("../../assets/avatar/faces/*.svg", {
    eager: true,
    query: "?raw",
    import: "default",
  }),
);

export const partUrl = (parts: AvatarPart[], id: string | null | undefined) =>
  parts.find((p) => p.id === id)?.url ?? null;

export const baseMarkup = (id: string) => BASE_MARKUP.get(id) ?? null;

export const faceMarkup = (id: string) => FACE_MARKUP.get(id) ?? null;

/** An avatar's layers as HTML from the bundled parts; unknown ids draw nothing. */
export function avatarMarkup({ base, face, accessory }: AvatarParts): string {
  const accessoryUrl = partUrl(ACCESSORIES, accessory);
  const accessoryImage = accessoryUrl
    ? `<img src="${accessoryUrl}" alt="" draggable="false" class="absolute inset-0 size-full">`
    : "";
  return (
    '<span class="avatar-react absolute inset-0"><span class="avatar-breathe absolute inset-0">' +
    `<span class="absolute inset-0">${baseMarkup(base) ?? ""}</span>` +
    `<span class="avatar-head absolute inset-0">${faceMarkup(face) ?? ""}${accessoryImage}</span>` +
    "</span></span>"
  );
}
