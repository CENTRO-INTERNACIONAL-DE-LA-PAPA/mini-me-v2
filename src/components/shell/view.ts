/** What the main area shows. A Conversation needs an open Project; the others do not. */
export type View =
  | { kind: "home" }
  | { kind: "conversation"; id: string }
  | { kind: "settings" }
  | { kind: "avatars" };
