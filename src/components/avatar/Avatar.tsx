import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { AvatarColor } from "./palette";
import { ACCESSORIES, FACES, baseMarkup, partUrl } from "./parts";

export interface AvatarStyle {
  base: string;
  face: string;
  accessory?: string | null;
  /** The body and freckle colours; the base's own yellow when left out. */
  color?: AvatarColor | null;
}

interface Props extends AvatarStyle {
  size?: number;
  className?: string;
}

/** Draws an avatar by stacking its base, face and optional accessory. Unknown ids draw nothing. */
export function Avatar({ base, face, accessory, color, size = 64, className }: Props) {
  const markup = baseMarkup(base);
  const layers = [partUrl(FACES, face), partUrl(ACCESSORIES, accessory)];
  const style = {
    width: size,
    height: size,
    "--avatar-solid": color?.solid,
    "--avatar-ink": color?.ink,
  } as CSSProperties;
  return (
    <span
      role="img"
      aria-label="Avatar"
      className={cn("relative inline-block shrink-0", className)}
      style={style}
    >
      {markup && (
        <span
          className="absolute inset-0"
          // The markup is one of the bundled base SVGs, never user input.
          dangerouslySetInnerHTML={{ __html: markup }}
        />
      )}
      {layers.map(
        (url, i) =>
          url && (
            <img
              key={i}
              src={url}
              alt=""
              draggable={false}
              className="absolute inset-0 size-full"
            />
          ),
      )}
    </span>
  );
}
