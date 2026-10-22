import type { MiniMe } from "../protocol/types";
import { Avatar } from "./avatar/Avatar";

// An unknown Mini-Me, such as the author of a reply from a Mini-Me that no longer exists, is
// drawn as a plain potato in the neutral "off" colours.
const UNKNOWN = { base: "classic", face: "neutral", color: { solid: "#d0cfc9", ink: "#8a8a8a" } };

/** A Mini-Me's avatar in its own colours, or a neutral one when the Mini-Me is unknown. */
export function MiniMeAvatar({
  miniMe,
  size,
  className,
}: {
  miniMe?: MiniMe;
  size: number;
  className?: string;
}) {
  return miniMe ? (
    <Avatar
      base={miniMe.avatar.base}
      face={miniMe.avatar.face}
      accessory={miniMe.avatar.accessory}
      color={miniMe.colors}
      size={size}
      className={className}
    />
  ) : (
    <Avatar {...UNKNOWN} size={size} className={className} />
  );
}
