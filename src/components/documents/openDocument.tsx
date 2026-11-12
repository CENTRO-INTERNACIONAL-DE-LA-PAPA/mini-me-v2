import { createContext, useCallback, useContext, useRef, type ReactNode } from "react";
import { api } from "../../api";

/** Opens `assetId` in the document view, with the Comments sheet on `edits` when given. */
type OpenDocument = (assetId: string, edits?: string[]) => void;

// Provided around a Conversation; elsewhere documents open in the system's default app.
const OpenDocumentContext = createContext<OpenDocument | null>(null);

export function OpenDocumentProvider({
  open,
  children,
}: {
  open: OpenDocument;
  children: ReactNode;
}) {
  return <OpenDocumentContext.Provider value={open}>{children}</OpenDocumentContext.Provider>;
}

/** Opens a document in the document view, or null outside a Conversation. */
export const useOpenDocument = () => useContext(OpenDocumentContext);

interface OpenFileOptions {
  /** Opens documents where there is no Conversation's document view. */
  openDocument?: (assetId: string) => void;
  /** Gets why the system's default app failed; without it, failures are dropped. */
  onError?: (e: unknown) => void;
}

/** Opens a file in the document view when `asDocument` and one is open, else in the system app. */
export function useOpenFile(projectId: string | undefined, options: OpenFileOptions = {}) {
  const fromConversation = useOpenDocument();
  const latest = useRef(options);
  latest.current = options;
  return useCallback(
    (assetId: string, asDocument: boolean) => {
      const { openDocument = fromConversation, onError = () => {} } = latest.current;
      if (openDocument && asDocument) openDocument(assetId);
      else if (projectId) void api.openAsset(projectId, assetId).catch(onError);
    },
    [projectId, fromConversation],
  );
}
