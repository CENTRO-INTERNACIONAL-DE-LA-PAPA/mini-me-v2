import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { MiniMe, TextComponent } from "../protocol/types";
import { MiniMePill } from "./MiniMePill";

/** A Text Component in a message: a Mini-Me's pill, or a file chip that opens the file. */
export function TextComponentChip({
  component,
  miniMes,
  onOpenAsset,
  children,
}: {
  component: TextComponent;
  miniMes: MiniMe[];
  onOpenAsset: (assetId: string) => void;
  children: ReactNode;
}) {
  if (component.kind === "mini_me") {
    return <MiniMePill miniMe={miniMes.find((m) => m.id === component.id)}>{children}</MiniMePill>;
  }
  return (
    <Badge
      variant="secondary"
      title="Open file"
      className="cursor-pointer align-baseline"
      render={<button onClick={() => onOpenAsset(component.id)} />}
    >
      {children}
    </Badge>
  );
}
