import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatusRow({
  dot = "bg-off",
  error,
  action,
  children,
}: {
  /** The dot's colour class. */
  dot?: string;
  error?: string | null;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div role="status" className="flex items-start gap-2 text-meta text-muted-foreground">
      <span aria-hidden className={cn("mt-1.5 size-[7px] shrink-0 rounded-full", dot)} />
      <p className="flex-1">
        {children}
        {error && <span className="block text-destructive">{error}</span>}
      </p>
      {action}
    </div>
  );
}
