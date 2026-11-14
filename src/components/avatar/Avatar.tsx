import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { trackLook } from "./look";
import { SMALL_AVATAR, avatarClass, hop, randomDelay } from "./motion";
import type { AvatarColor } from "./palette";
import { avatarMarkup, type AvatarParts } from "./parts";

export interface AvatarStyle extends AvatarParts {
  /** The body and freckle colours; the base's own yellow when left out. */
  color?: AvatarColor | null;
}

interface Props extends AvatarStyle {
  size?: number;
  /** Plays the working animation, for the avatar of a reply that is streaming. */
  working?: boolean;
  className?: string;
}

/** Draws an avatar by stacking its base, face and optional accessory, animated by `index.css`.
 * Unknown ids draw nothing. */
export function Avatar({ base, face, accessory, color, size = 64, working, className }: Props) {
  const element = useRef<HTMLSpanElement>(null);
  const [delay] = useState(randomDelay);
  useEffect(() => {
    if (element.current && size >= SMALL_AVATAR) return trackLook(element.current);
  }, [size]);
  const style = {
    width: size,
    height: size,
    "--avatar-solid": color?.solid,
    "--avatar-ink": color?.ink,
    "--avatar-delay": delay,
  } as CSSProperties;
  return (
    <span
      ref={element}
      role="img"
      aria-label="Avatar"
      className={cn("relative inline-block shrink-0", avatarClass(size, working), className)}
      style={style}
      onClick={(event) => hop(event.currentTarget)}
      // The markup comes from the bundled part files, never user input.
      dangerouslySetInnerHTML={{ __html: avatarMarkup({ base, face, accessory }) }}
    />
  );
}
