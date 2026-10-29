import { createContext, useContext, type ReactNode } from "react";

/** Opens the document `assetId` in the document view, with its Comments sheet showing when
 * `comments` is set. */
type OpenDocument = (assetId: string, comments?: boolean) => void;

// Provided around a Conversation, so a reply's document card and attachments can open a
// document in the document view; elsewhere documents open in the system's default app.
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
