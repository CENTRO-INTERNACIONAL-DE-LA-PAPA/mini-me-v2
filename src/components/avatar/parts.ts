import type { MiniMeAvatar } from "../../protocol/types";
import { LAYER_DEFINITIONS } from "./layers";

export interface AvatarPart {
  id: string;
  label: string;
  /** The exported SVG, adapted by `adapt`. */
  markup: string;
}

export interface AvatarLayer {
  name: string;
  label: string;
  required: boolean;
  lean: number;
  parts: AvatarPart[];
}

// The colours the drawings use for the body and the freckles, which take the Mini-Me's own.
const PLACEHOLDERS: [string, string][] = [
  ["#F5B800", "--avatar-solid"],
  ["#7A5A00", "--avatar-ink"],
];

/** An exported part made drawable: placeholder colours read the avatar's colour variables,
 * shapes with a `blink…` id get the `blink` class (an id would repeat across avatars), and
 * the svg fills its layer. */
export function adapt(markup: string): string {
  let adapted = markup.replace("<svg ", '<svg class="size-full" ');
  for (const [colour, variable] of PLACEHOLDERS) {
    adapted = adapted.replace(
      new RegExp(`(fill|stroke)="${colour}"`, "gi"),
      `style="$1: var(${variable}, ${colour})"`,
    );
  }
  return adapted.replace(/\bid="blink[^"]*"/g, 'class="blink"');
}

// "../../assets/avatar/bases/red-bliss.svg" -> "red-bliss"
const fileStem = (path: string) => path.slice(path.lastIndexOf("/") + 1, -".svg".length);

const loadParts = (files: Record<string, string>): AvatarPart[] =>
  Object.entries(files)
    .map(([path, markup]) => {
      const id = fileStem(path);
      return { id, label: id.replace(/-/g, " "), markup: adapt(markup) };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

/** Every layer with its parts, in drawing order. */
export const LAYERS: AvatarLayer[] = LAYER_DEFINITIONS.map(({ files, ...layer }) => ({
  ...layer,
  parts: loadParts(files),
}));

export const partMarkup = (layer: AvatarLayer, id: string | undefined) =>
  layer.parts.find((p) => p.id === id)?.markup ?? null;

/** A random part for each layer with parts; optional layers are left empty a quarter of the
 * time. */
export const randomAvatar = (): MiniMeAvatar =>
  Object.fromEntries(
    LAYERS.filter((l) => l.parts.length > 0 && (l.required || Math.random() >= 0.25)).map((l) => [
      l.name,
      l.parts[Math.floor(Math.random() * l.parts.length)].id,
    ]),
  );

/** `avatar` with `layer` drawing part `id`, or nothing when `id` is null. */
export function withPart(avatar: MiniMeAvatar, layer: string, id: string | null): MiniMeAvatar {
  const { [layer]: _, ...rest } = avatar;
  return id === null ? rest : { ...rest, [layer]: id };
}

/** An avatar's layers as HTML, each in a wrapper the animations in `index.css` key on; an
 * unknown or missing part draws nothing for its layer. */
export function avatarMarkup(avatar: MiniMeAvatar): string {
  const layers = LAYERS.map((layer) => {
    const markup = partMarkup(layer, avatar[layer.name]);
    return markup
      ? `<span data-layer="${layer.name}" class="absolute inset-0" style="--layer-lean: ${layer.lean}%">${markup}</span>`
      : "";
  }).join("");
  return (
    '<span class="avatar-react absolute inset-0"><span class="avatar-breathe absolute inset-0">' +
    layers +
    "</span></span>"
  );
}
