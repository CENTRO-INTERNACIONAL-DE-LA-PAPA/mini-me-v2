import { ComponentCard } from "./ComponentCard";
import { Button } from "@/components/ui/button";
import { FileTextIcon } from "lucide-react";
import { api } from "../../api";
import { useLoad } from "../../hooks/useLoad";
import { useOpenFile } from "../documents/openDocument";
import type { Renderers, RendererProps } from "./catalogue";

/** `document` version 1 preview, `{ asset_id, title }`, as the write-a-document tool adds it. */
interface DocumentData {
  asset_id?: string;
  title?: string;
}

/** A document a reply wrote or edited, with an Open button, or a note that it was removed. */
export function DocumentCard({
  title,
  meta = "Quarto document",
  removed,
  onOpen,
}: {
  title: string;
  meta?: string;
  removed: boolean;
  onOpen: () => void;
}) {
  return (
    <ComponentCard className="flex-row items-center gap-3">
      <FileTextIcon aria-hidden className="size-4.5 shrink-0 text-mm-ink" />
      <span className="grid min-w-0 flex-1">
        <span className="truncate font-medium text-foreground">{title}</span>
        <span className="text-meta text-muted-foreground">
          {removed ? "This document was removed from the Project." : meta}
        </span>
      </span>
      {!removed && (
        <Button variant="secondary" size="sm" onClick={onOpen}>
          Open
        </Button>
      )}
    </ComponentCard>
  );
}

/** Whether the document `assetId` is gone from the Project, once its files have been read. */
export function useRemoved(projectId: string | undefined, assetId: string | undefined) {
  const { value: removed } = useLoad(
    () =>
      projectId && assetId
        ? api.listAssets(projectId, "").then((assets) => !assets.some((a) => a.id === assetId))
        : undefined,
    [projectId, assetId],
  );
  return removed ?? false;
}

function DocumentV1({ preview, projectId }: RendererProps) {
  const { asset_id: assetId, title } = (preview ?? {}) as DocumentData;
  const openFile = useOpenFile(projectId);
  const removed = useRemoved(projectId, assetId);

  const open = () => {
    if (!assetId) return;
    openFile(assetId, true);
  };
  return (
    <DocumentCard
      title={title || "Untitled document"}
      removed={removed || !assetId}
      onOpen={open}
    />
  );
}

export const renderers: Renderers = { 1: DocumentV1 };
