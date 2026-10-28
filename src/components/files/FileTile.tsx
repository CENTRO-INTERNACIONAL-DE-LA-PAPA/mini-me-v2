import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MiniMe } from "../../protocol/types";
import { surfaceStyle } from "../minime/miniMeColors";

/** A file's or output's icon tile: in the tint of the Mini-Me that made it, with its ink
 * icon, or neutral for your own. */
export function FileTile({
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
    <span
      aria-hidden
      style={surfaceStyle(miniMe?.colors)}
      className={cn(
        "flex shrink-0 items-center justify-center border border-edge bg-tint text-(--mm-ink,var(--ink-2))",
        size === "sm" ? "size-8 rounded-lg" : "size-[42px] rounded-well",
      )}
    >
      <Icon className={size === "sm" ? "size-4" : "size-5"} />
    </span>
  );
}
