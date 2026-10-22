/** What the main area shows. Files and a Conversation need an open Project; the others do not. */
export type View =
  | { kind: "home" }
  | { kind: "files" }
  | { kind: "conversation"; id: string }
  | { kind: "settings" }
  | { kind: "avatars" };
