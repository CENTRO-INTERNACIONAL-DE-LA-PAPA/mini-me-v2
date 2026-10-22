import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { MiniMe } from "../protocol/types";
import { MiniMeAvatar } from "./MiniMeAvatar";

/** The pill's colours: the Mini-Me's tint and ink, or neutral when it is unknown. */
export function pillStyle(miniMe?: MiniMe): CSSProperties | undefined {
  return miniMe && { backgroundColor: miniMe.colors.tint, color: miniMe.colors.ink };
}

/**
 * A Mini-Me named inline: its avatar and name on a rounded chip in its tint with ink text.
 * `children` is the text shown, so a mention keeps the label it was sent with.
 */
export function MiniMePill({
  miniMe,
  children,
  className,
}: {
  miniMe?: MiniMe;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full pr-2 pl-[3px] align-baseline text-[13px]",
        "whitespace-nowrap",
        !miniMe && "bg-muted text-ink-2",
        className,
      )}
      style={pillStyle(miniMe)}
    >
      <MiniMeAvatar miniMe={miniMe} size={16} />
      {children}
    </span>
  );
}
