import { useEffect, useState } from "react";
import { api } from "../../api";
import { useOpenDocument } from "../documents/openDocument";
import type { Renderers, RendererProps } from "./catalogue";
import { DocumentCard, useRemoved } from "./document";

/** `document-edits` version 1 data; `threads` are the comment threads the edits opened. */
interface DocumentEditsData {
  asset_id?: string;
  title?: string;
  threads?: string[];
}

/** The card's line on how many of `total` suggested edits wait; `waiting` is null until counted. */
export function editsWaiting(waiting: number | null, total: number): string {
  const edits = total === 1 ? "suggested edit" : "suggested edits";
  if (waiting === null) return `${total} ${edits}`;
  if (waiting === 0) {
    return total === 1 ? "Suggested edit answered" : `All ${total} ${edits} answered`;
  }
  return `${waiting} of ${total} ${edits} waiting`;
}

/** A reply's suggested edits to a document, with Open to answer them in its Comments sheet. */
function DocumentEditsV1({ data, projectId }: RendererProps) {
  const { asset_id: assetId, title, threads = [] } = (data ?? {}) as DocumentEditsData;
  const openDocument = useOpenDocument();
  const removed = useRemoved(projectId, assetId);
  // Counted once when shown: edits are answered in the document view, outside the Conversation.
  const [waiting, setWaiting] = useState<number | null>(null);

  useEffect(() => {
    if (!projectId || !assetId) return;
    let active = true;
    api
      .listThreads(projectId, assetId)
      .then((listed) => {
        const pending = listed.filter((t) => t.pending && threads.includes(t.conversation_id));
        if (active) setWaiting(pending.length);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [projectId, assetId]);

  return (
    <DocumentCard
      title={title || "Untitled document"}
      meta={editsWaiting(waiting, threads.length)}
      removed={removed || !assetId}
      onOpen={() => assetId && openDocument?.(assetId, threads)}
    />
  );
}

export const renderers: Renderers = { 1: DocumentEditsV1 };
