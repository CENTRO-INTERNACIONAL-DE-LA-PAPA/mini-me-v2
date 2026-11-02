import { ArrowRightIcon } from "lucide-react";
import { api } from "../../api";
import { useMiniMes } from "../../hooks/useMiniMes";
import type { MiniMe } from "../../protocol/types";
import { ReferenceChip } from "../chat/ReferenceChip";
import { useOpenDocument } from "../documents/openDocument";
import { isDocument } from "../files/files";
import { MiniMePill } from "../minime/MiniMePill";
import type { Renderers, RendererProps } from "./catalogue";

/** `hand-off` version 1 data, as the core adds it when a reply hands off. */
interface HandOffData {
  mini_me_id?: string;
  request?: string;
  file?: { asset_id?: string; name?: string } | null;
}

/** A reply's hand-off: the Mini-Me it went to, what it was asked, and the file it was given. */
export function HandOffCard({
  miniMe,
  name,
  request,
  fileName,
  onOpenFile,
}: {
  miniMe?: MiniMe;
  name: string;
  request: string;
  fileName?: string;
  onOpenFile?: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-card border border-card-edge bg-card px-4 py-3">
      <ArrowRightIcon aria-hidden className="mt-0.5 size-[18px] shrink-0 text-mm-ink" />
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="text-meta text-muted-foreground">
          Handed to <MiniMePill miniMe={miniMe}>@{name}</MiniMePill>
        </span>
        <span className="text-foreground">{request}</span>
        {fileName && (
          <span>
            <ReferenceChip title="Open file" onOpen={onOpenFile}>
              #{fileName}
            </ReferenceChip>
          </span>
        )}
      </span>
    </div>
  );
}

function HandOffV1({ data, projectId }: RendererProps) {
  const { mini_me_id: miniMeId, request, file } = (data ?? {}) as HandOffData;
  const miniMe = useMiniMes().find((m) => m.id === miniMeId);
  const openDocument = useOpenDocument();
  const assetId = file?.asset_id;
  const fileName = file?.name;

  const openFile = () => {
    if (!assetId) return;
    if (openDocument && fileName && isDocument(fileName)) openDocument(assetId);
    else if (projectId) void api.openAsset(projectId, assetId).catch(() => {});
  };
  return (
    <HandOffCard
      miniMe={miniMe}
      name={miniMe?.name ?? "a Mini-Me"}
      request={request ?? ""}
      fileName={fileName}
      onOpenFile={openFile}
    />
  );
}

export const renderers: Renderers = { 1: HandOffV1 };
