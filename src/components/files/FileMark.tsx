import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MiniMe } from "../../protocol/types";
import { surfaceStyle } from "../minime/miniMeColors";

/** A file's or output's icon: in the ink of the Mini-Me that made it, or neutral for your
 * own. */
export function FileMark({
  miniMe,
  icon: Icon,
  size = "sm",
}: {
  miniMe?: MiniMe;
  icon: LucideIcon;
  /** `sm` for rows in a column, `lg` for the Files list. */
  size?: "sm" | "lg";
}) {
  return (
    <Icon
      aria-hidden
      style={surfaceStyle(miniMe?.colors)}
      className={cn("shrink-0 text-(--mm-ink,var(--ink-2))", size === "sm" ? "size-4" : "size-5")}
    />
  );
}
