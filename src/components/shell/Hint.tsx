import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ComponentProps, ReactElement, ReactNode } from "react";

/** Shows `label` in a tooltip when `children`, a single element, is hovered or focused; with no
 * `label`, `children` alone. */
export function Hint({
  label,
  side,
  disabled = false,
  children,
}: {
  label: ReactNode;
  side?: ComponentProps<typeof TooltipContent>["side"];
  /** `children` is disabled: it takes no pointer events, so a wrapper carries the hint. */
  disabled?: boolean;
  children: ReactElement;
}) {
  if (label === undefined || label === null || label === false || label === "") return children;
  return (
    <Tooltip>
      <TooltipTrigger
        render={disabled ? <span className="inline-flex w-fit">{children}</span> : children}
      />
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
