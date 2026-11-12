import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** A chip naming a file, table or chart, outlined so it reads on a bubble, a reply or the
 * composer alike; with `onOpen` it is a button. Mini-Mes use `MiniMePill` instead. */
export function ReferenceChip({
  icon: Icon,
  title,
  onOpen,
  className,
  children,
}: {
  icon?: LucideIcon;
  /** The tooltip, such as "Open file". */
  title?: string;
  onOpen?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Badge
      variant="outline"
      title={title}
      className={cn("align-middle", onOpen && "cursor-pointer", className)}
      render={onOpen ? <button type="button" onClick={onOpen} /> : undefined}
    >
      {Icon && <Icon aria-hidden className="size-[13px]" />}
      {children}
    </Badge>
  );
}
