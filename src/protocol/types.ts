// Mirrors src-tauri/src/protocol.rs; protocol/fixtures/events.json is checked by tests on
// both sides.

export type Uuid = string;

export interface Origin {
  installation_id: Uuid;
  user_id: Uuid;
}

export type AuthorKind = "user" | "mini_me" | "system";

export interface Author {
  kind: AuthorKind;
  id: string;
}

export type MessageStatus = "streaming" | "complete" | "failed" | "cancelled";

export interface AssetRef {
  id: Uuid;
  name: string;
  media_type: string;
  size_bytes: number;
}

/** `start` and `end` are UTF-16 code unit offsets, i.e. plain JavaScript string indices. */
export interface TextComponent {
  kind: "asset";
  id: Uuid;
  label: string;
  start: number;
  end: number;
}

export interface Message {
  id: Uuid;
  author: Author;
  content: string;
  status: MessageStatus;
  reply_to: Uuid | null;
  attachments: AssetRef[];
  text_components: TextComponent[];
}

export interface ErrorInfo {
  code: string;
  message: string;
}

/** What a reply's producer is doing; `fraction` is from 0 to 1, or null when unknown. */
export interface Progress {
  label: string;
  fraction: number | null;
}

interface Envelope {
  id: Uuid;
  v: number;
  project_id: Uuid;
  conversation_id: Uuid;
  seq: number;
  ts: number;
  origin: Origin;
}

export type KnownEvent = Envelope &
  (
    | { type: "message.created"; payload: { message: Message } }
    | { type: "message.delta"; payload: { message_id: Uuid; text: string } }
    | { type: "message.progress"; payload: { message_id: Uuid } & Progress }
    | { type: "message.completed"; payload: { message_id: Uuid; content: string } }
    | { type: "message.failed"; payload: { message_id: Uuid; error: ErrorInfo } }
    | { type: "message.cancelled"; payload: { message_id: Uuid } }
    | { type: "attachment.added"; payload: { message_id: Uuid; asset: AssetRef } }
    | { type: "reaction.added"; payload: { message_id: Uuid; emoji: string; by: Author } }
    | { type: "reaction.removed"; payload: { message_id: Uuid; emoji: string; by: Author } }
  );

/** Any event on the wire, including types this version of the UI does not know. */
export type ProtocolEvent = Envelope & { type: string; payload: unknown };

export type SidecarState = "starting" | "ready" | "restarting" | "stopped" | "incompatible";

export interface SidecarStatus {
  state: SidecarState;
  /** Human-readable explanation; set whenever `state` is not `ready`. */
  detail: string | null;
  protocol: number | null;
  sidecar_version: string | null;
}

/** An update to a newer published release, as tracked by the Rust core. */
export type UpdateStatus =
  | { state: "none" }
  /** `percent` is whole, 0 to 100, or null while the size is unknown. */
  | { state: "downloading"; version: string; percent: number | null }
  /** Downloaded and verified, waiting for a restart. */
  | { state: "ready"; version: string };

/** Error shape returned by every Rust command. */
export interface AppError {
  code: string;
  message: string;
}

export interface ProjectSummary {
  id: Uuid;
  name: string;
  created_at: number;
}

export interface ConversationSummary {
  id: Uuid;
  title: string;
  created_at: number;
  last_activity_at: number;
}

export interface SendMessageInput {
  content: string;
  attachments: Uuid[];
  text_components: TextComponent[];
}
