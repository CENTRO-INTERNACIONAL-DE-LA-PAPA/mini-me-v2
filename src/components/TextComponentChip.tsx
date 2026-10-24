import type { ReactNode } from "react";
import { ChartColumnIcon, Table2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MiniMe, TextComponent } from "../protocol/types";
import { useComponentName } from "./interactive/component-references";
import { MiniMePill } from "./MiniMePill";

/** A Text Component in a message: a Mini-Me's pill, a `$` table or chart chip, or a file chip
 * that opens the file. */
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
  if (component.kind === "component") {
    return <ComponentChip componentId={component.id}>{children}</ComponentChip>;
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

/** A `$` reference: a chart's icon for a chart of the open Conversation, else a table's. */
function ComponentChip({ componentId, children }: { componentId: string; children: ReactNode }) {
  const Icon = useComponentName(componentId)?.kind === "chart" ? ChartColumnIcon : Table2Icon;
  return (
    <Badge variant="secondary" className="align-baseline">
      <Icon aria-hidden className="size-[13px]" />
      {children}
    </Badge>
  );
}
