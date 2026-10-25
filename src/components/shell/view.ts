/** What the main area shows. The Overview, Files and a Conversation need an open Project;
 * the others do not. A Conversation opened at `messageId` scrolls to that message. A Mini-Me
 * or Trait editor opens `id`, starts a copy of `from`, or, with neither, starts a new one. */
export type View =
  | { kind: "home" }
  | { kind: "overview" }
  | { kind: "files" }
  | { kind: "conversation"; id: string; messageId?: string }
  | { kind: "settings" }
  | { kind: "avatars" }
  | { kind: "library"; tab?: LibraryTab }
  | { kind: "mini-me"; id?: string; from?: string }
  | { kind: "trait"; id?: string; from?: string };

export type LibraryTab = "mini-mes" | "traits";

/** Views that belong to the app rather than to the open Project. */
export const isAppView = (view: View) =>
  ["settings", "avatars", "library", "mini-me", "trait"].includes(view.kind);
