import type { ReactNode } from "react";
import { ChartColumnIcon, Table2Icon } from "lucide-react";
import type { MiniMe, TextComponent } from "../../protocol/types";
import { useComponentName } from "../interactive/component-references";
import { MiniMePill } from "../minime/MiniMePill";
import { ReferenceChip } from "./ReferenceChip";
import { useFileExists } from "./existingFiles";

/** A Text Component: a Mini-Me's pill, or a `$` or file chip that opens it when `onOpenComponent`
 * or `onOpenAsset` is given. Outside a Conversation, `componentKind` marks a `$` chart. */
export function TextComponentChip({
  component,
  miniMes,
  onOpenAsset,
  onOpenComponent,
  componentKind,
  children,
}: {
  component: TextComponent;
  miniMes: MiniMe[];
  onOpenAsset?: (assetId: string) => void;
  onOpenComponent?: (componentId: string) => void;
  componentKind?: "table" | "chart";
  children: ReactNode;
}) {
  const exists = useFileExists(component.kind === "asset" ? component.id : null);
  if (component.kind === "mini_me") {
    return <MiniMePill miniMe={miniMes.find((m) => m.id === component.id)}>{children}</MiniMePill>;
  }
  if (component.kind === "component") {
    return (
      <ComponentChip
        componentId={component.id}
        kind={componentKind}
        onOpen={onOpenComponent && (() => onOpenComponent(component.id))}
      >
        {children}
      </ComponentChip>
    );
  }
  if (!exists) {
    return (
      <ReferenceChip title="This file was deleted" className="text-muted-foreground">
        {children} (Deleted)
      </ReferenceChip>
    );
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

/** A `$` reference: a chart's icon for a chart of the open Conversation or of `kind`, else a
 * table's. */
function ComponentChip({
  componentId,
  kind,
  onOpen,
  children,
}: {
  componentId: string;
  kind?: "table" | "chart";
  onOpen?: () => void;
  children: ReactNode;
}) {
  const chart = (useComponentName(componentId)?.kind ?? kind) === "chart";
  return (
    <ReferenceChip
      icon={chart ? ChartColumnIcon : Table2Icon}
      title={onOpen && "Open in its Conversation"}
      onOpen={onOpen}
    >
      {children}
    </ReferenceChip>
  );
}
