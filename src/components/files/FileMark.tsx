import type { LucideIcon } from "lucide-react";
import type { MiniMe } from "../../protocol/types";
import { surfaceStyle } from "../minime/miniMeColors";

/** A file's or output's icon, in the ink of the Mini-Me that made it, or neutral for your own. */
export function FileMark({
  miniMe,
  icon: Icon,
}: {
  miniMe?: MiniMe;
  icon: LucideIcon;
}) {
  return (
    <Icon
      aria-hidden
      style={surfaceStyle(miniMe?.colors)}
      className="shrink-0 text-(--mm-ink,var(--ink-2)) size-4"
    />
  );
}
