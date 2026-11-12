import { api } from "../../api";
import { useLoad } from "../../hooks/useLoad";
import { count } from "../../lib/format";
import { useOpenDocument } from "../documents/openDocument";
import type { Renderers, RendererProps } from "./catalogue";
import { DocumentCard, useRemoved } from "./document";

/** `document-edits` version 1 data; `threads` are the comment threads the edits opened. */
interface DocumentEditsData {
  asset_id?: string;
  title?: string;
  threads?: string[];
}

export function editsLabel(waiting: number | null, total: number): string {
  const edits = count(total, "suggested edit");
  if (waiting === null) return edits;
  if (waiting === 0) {
    return total === 1 ? "Suggested edit answered" : `All ${edits} answered`;
  }
  return `${waiting} of ${edits} waiting`;
}

/** A reply's suggested edits to a document, with Open to answer them in its Comments sheet. */
function DocumentEditsV1({ data, projectId }: RendererProps) {
  const { asset_id: assetId, title, threads = [] } = (data ?? {}) as DocumentEditsData;
  const openDocument = useOpenDocument();
  const removed = useRemoved(projectId, assetId);
  // Counted once when shown: edits are answered in the document view, outside the Conversation.
  const { value: waiting } = useLoad(
    () =>
      projectId && assetId
        ? api
            .listThreads(projectId, assetId)
            .then(
              (listed) =>
                listed.filter((t) => t.pending && threads.includes(t.conversation_id)).length,
            )
        : undefined,
    [projectId, assetId],
  );

  return (
    <DocumentCard
      title={title || "Untitled document"}
      meta={editsLabel(waiting ?? null, threads.length)}
      removed={removed || !assetId}
      onOpen={() => assetId && openDocument?.(assetId, threads)}
    />
  );
}

export const renderers: Renderers = { 1: DocumentEditsV1 };
