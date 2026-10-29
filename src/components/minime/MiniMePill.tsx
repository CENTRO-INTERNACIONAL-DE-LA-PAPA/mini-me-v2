import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MiniMe } from "../../protocol/types";
import { surfaceStyle } from "./miniMeColors";
import { MiniMeAvatar } from "./MiniMeAvatar";

/**
 * A Mini-Me named inline: its avatar and name on a pill in its tint with ink text, neutral
 * when it is unknown. `children` is the text shown, so a mention keeps the label it was sent
 * with. The `tag` size is the larger name tag under a Conversation's title.
 */
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
