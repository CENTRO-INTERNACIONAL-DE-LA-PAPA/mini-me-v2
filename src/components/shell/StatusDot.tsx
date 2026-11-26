import { cn } from "@/lib/utils";

/** A small status dot; `className` gives its colour, such as `bg-success`. */
export function StatusDot({ className }: { className?: string }) {
  return <span aria-hidden className={cn("size-2 shrink-0 rounded-full bg-off", className)} />;
}
