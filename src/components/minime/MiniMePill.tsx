import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MiniMe } from "../../protocol/types";
import { surfaceStyle } from "./miniMeColors";
import { MiniMeAvatar } from "./MiniMeAvatar";

/** A Mini-Me named inline on its tint, neutral when unknown. `children` is the label shown, so a
 * mention keeps the one it was sent with; `tag` is the name tag under a Conversation's title. */
export function MiniMePill({
  miniMe,
  size = "inline",
  children,
  className,
}: {
  miniMe?: MiniMe;
  size?: "inline" | "tag";
  children: ReactNode;
  className?: string;
}) {
  const tag = size === "tag";
  return (
    <Badge
      variant="mini-me"
      style={surfaceStyle(miniMe?.colors)}
      className={cn(
        "align-middle",
        tag ? "h-[30px] gap-[7px] pr-3 pl-[3px] text-control font-medium" : "pr-2 pl-[3px]",
        className,
      )}
    >
      <MiniMeAvatar miniMe={miniMe} size={tag ? 24 : 16} />
      {children}
    </Badge>
  );
}
