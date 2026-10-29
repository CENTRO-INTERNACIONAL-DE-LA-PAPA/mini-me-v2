/** What the main area shows. The Overview, Files, a Conversation and a document need an open
 * Project; the others do not. A Conversation opened at `messageId` scrolls to that message. A
 * Mini-Me or Trait editor opens `id`, starts a copy of `from`, or, with neither, starts a new
 * one. A document returns to `from` when closed, and is drafted from the Conversation
 * `draftFrom` when given. */
export type View =
  | { kind: "home" }
  | { kind: "overview" }
  | { kind: "files" }
  | { kind: "conversation"; id: string; messageId?: string }
  | { kind: "document"; assetId: string; from: View; draftFrom?: string; comments?: boolean }
  | { kind: "settings" }
  | { kind: "avatars" }
  | { kind: "library"; tab?: LibraryTab }
  | { kind: "mini-me"; id?: string; from?: string }
  | { kind: "trait"; id?: string; from?: string };

export type LibraryTab = "mini-mes" | "traits";
