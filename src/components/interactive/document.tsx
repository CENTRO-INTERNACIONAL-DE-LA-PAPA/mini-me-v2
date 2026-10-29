import { Button } from "@/components/ui/button";
import { FileTextIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useOpenDocument } from "../documents/openDocument";
import type { Renderers, RendererProps } from "./catalogue";

/** `document` version 1 data, `{ asset_id, title }`, as the write-a-document tool adds it. */
interface DocumentData {
  asset_id?: string;
  title?: string;
}

/** A document a reply wrote or edited: its title, `meta` below it, and an Open button, or a
 * note that it was removed. */
export function DocumentCard({
  title,
  meta = "Document · Quarto",
  removed,
  onOpen,
}: {
  title: string;
  meta?: string;
  removed: boolean;
  onOpen: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-card-edge bg-card px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-tint text-mm-ink">
        <FileTextIcon className="size-[18px]" />
      </span>
      <span className="grid min-w-0 flex-1">
        <span className="truncate font-medium text-foreground">{title}</span>
        <span className="text-meta text-muted-foreground">
          {removed ? "This document was removed from the Project." : meta}
        </span>
      </span>
      {!removed && (
        <Button variant="mini-me" size="sm" onClick={onOpen}>
          Open
        </Button>
      )}
    </div>
  );
}

/** Whether the document `assetId` is gone from the Project, once its files have been read. */
export function useRemoved(projectId: string | undefined, assetId: string | undefined) {
  const [removed, setRemoved] = useState(false);
  useEffect(() => {
    if (!projectId || !assetId) return;
    let active = true;
    api
      .listAssets(projectId, "")
      .then((assets) => active && setRemoved(!assets.some((a) => a.id === assetId)))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [projectId, assetId]);
  return removed;
}

function DocumentV1({ data, projectId }: RendererProps) {
  const { asset_id: assetId, title } = (data ?? {}) as DocumentData;
  const openDocument = useOpenDocument();
  const removed = useRemoved(projectId, assetId);

  const open = () => {
    if (!assetId) return;
    if (openDocument) openDocument(assetId);
    else if (projectId) void api.openAsset(projectId, assetId).catch(() => {});
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
