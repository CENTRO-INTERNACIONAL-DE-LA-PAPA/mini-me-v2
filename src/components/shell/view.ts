/** What the main area shows; the Overview, Files, a Conversation and a document need a Project.
 * A Conversation scrolls to `messageId`. An editor opens `id`, copies `from`, or starts anew.
 * Elsewhere closing returns to `from` (What's new: else Home); License and Third-party return to
 * Settings → About. A document is drafted from the Conversation `draftFrom`, and opens its
 * Comments sheet on a reply's `edits`. */
export type View =
  | { kind: "home" }
  | { kind: "overview" }
  | { kind: "files" }
  | { kind: "conversation"; id: string; messageId?: string }
  | { kind: "document"; assetId: string; from: View; draftFrom?: string; edits?: string[] }
  | { kind: "settings"; page?: SettingsPageId }
  | { kind: "whats-new"; from?: View }
  | { kind: "license" }
  | { kind: "third-party" }
  | { kind: "avatars" }
  | { kind: "library"; tab?: LibraryTab }
  | { kind: "mini-me"; id?: string; from?: string }
  | { kind: "trait"; id?: string; from?: string };

export type LibraryTab = "mini-mes" | "traits";

/** A page of Settings; Settings opens at `general` unless a view says otherwise. */
export type SettingsPageId = "general" | "models" | "accounts" | "developer" | "about";
