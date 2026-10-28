import { createContext, useContext, type ReactNode } from "react";

// Provided around a Conversation, so a reply's document card and attachments can open a
// document in the document view; elsewhere documents open in the system's default app.
const OpenDocumentContext = createContext<((assetId: string) => void) | null>(null);

export function OpenDocumentProvider({
  open,
  children,
}: {
  open: (assetId: string) => void;
  children: ReactNode;
}) {
  return <OpenDocumentContext.Provider value={open}>{children}</OpenDocumentContext.Provider>;
}

/** Opens a document in the document view, or null outside a Conversation. */
export const useOpenDocument = () => useContext(OpenDocumentContext);
