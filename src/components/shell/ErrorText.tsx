import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ErrorText({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn("text-meta text-destructive", className)}>{children}</p>;
}
