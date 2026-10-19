import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { MiniMe } from "../protocol/types";

/** The pill's colours: the Mini-Me's tint and ink, or neutral when it is unknown. */
export function pillStyle(miniMe?: MiniMe): CSSProperties | undefined {
  return miniMe && { backgroundColor: miniMe.colors.tint, color: miniMe.colors.ink };
}

/**
 * A Mini-Me named inline: its name on a rounded chip in its tint with ink text. `children` is
 * the text shown, so a mention keeps the label it was sent with.
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
        "inline-flex h-6 items-center rounded-full px-2 align-baseline text-[13px]",
        "whitespace-nowrap",
        !miniMe && "bg-muted text-ink-2",
        className,
      )}
      style={pillStyle(miniMe)}
    >
      {children}
    </span>
  );
}
