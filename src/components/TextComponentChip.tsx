import type { ReactNode } from "react";
import { ChartColumnIcon, Table2Icon } from "lucide-react";
import type { MiniMe, TextComponent } from "../protocol/types";
import { useComponentName } from "./interactive/component-references";
import { MiniMePill } from "./MiniMePill";
import { ReferenceChip } from "./ReferenceChip";

/** A Text Component: a Mini-Me's pill, a `$` table or chart chip, or a file chip that opens
 * the file when `onOpenAsset` is given. */
export function TextComponentChip({
  component,
  miniMes,
  onOpenAsset,
  children,
}: {
  component: TextComponent;
  miniMes: MiniMe[];
  onOpenAsset?: (assetId: string) => void;
  children: ReactNode;
}) {
  if (component.kind === "mini_me") {
    return <MiniMePill miniMe={miniMes.find((m) => m.id === component.id)}>{children}</MiniMePill>;
  }
  if (component.kind === "component") {
    return <ComponentChip componentId={component.id}>{children}</ComponentChip>;
  }
  return (
    <ReferenceChip
      title={onOpenAsset && "Open file"}
      onOpen={onOpenAsset && (() => onOpenAsset(component.id))}
    >
      {children}
    </ReferenceChip>
  );
}

/** A `$` reference: a chart's icon for a chart of the open Conversation, else a table's. */
function ComponentChip({ componentId, children }: { componentId: string; children: ReactNode }) {
  const Icon = useComponentName(componentId)?.kind === "chart" ? ChartColumnIcon : Table2Icon;
  return <ReferenceChip icon={Icon}>{children}</ReferenceChip>;
}
