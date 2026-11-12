import { createContext, useContext, type ReactNode } from "react";

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
