/** What the main area shows. The Overview, Files and a Conversation need an open Project;
 * the others do not. A Conversation opened at `messageId` scrolls to that message. */
export type View =
  | { kind: "home" }
  | { kind: "overview" }
  | { kind: "files" }
  | { kind: "conversation"; id: string; messageId?: string }
  | { kind: "settings" }
  | { kind: "avatars" };
