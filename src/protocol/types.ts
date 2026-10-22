// Mirrors src-tauri/src/protocol.rs; src-tauri/fixtures/events.json is checked by tests on
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

export type MessageStatus = "streaming" | "paused" | "complete" | "failed" | "cancelled";

export interface AssetRef {
  id: Uuid;
  name: string;
  media_type: string;
  size_bytes: number;
}

/** `start` and `end` are UTF-16 code unit offsets, i.e. plain JavaScript string indices. */
export interface TextComponent {
  kind: "asset" | "mini_me";
  id: Uuid;
  label: string;
  start: number;
  end: number;
}

/** An Interactive Component below a reply's text. `data` matches the schema of `kind` at
 * `version`; `text` stands in for it where the kind has no renderer. */
export interface Component {
  id: Uuid;
  kind: string;
  version: number;
  data: unknown;
  text: string;
  /** The user's answer, for kinds that ask for one; null until answered. */
  answer: unknown;
}

/** A Step of a reply's Workflow that has started. `output` is a Trait Step's text, a
 * condition's chosen branch, a loop's `repeat` or `stop`, or null. */
export interface MessageStep {
  step_id: string;
  type: "trait" | "approval" | "condition" | "loop" | "parallel";
  name: string;
  output: string | null;
  done: boolean;
}

export interface Message {
  id: Uuid;
  author: Author;
  content: string;
  status: MessageStatus;
  reply_to: Uuid | null;
  attachments: AssetRef[];
  text_components: TextComponent[];
  components: Component[];
  steps: MessageStep[];
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
    | { type: "message.paused"; payload: { message_id: Uuid } }
    | { type: "message.resumed"; payload: { message_id: Uuid } }
    | {
        type: "step.started";
        payload: { message_id: Uuid; step_id: string; type: MessageStep["type"]; name: string };
      }
    | {
        type: "step.completed";
        payload: { message_id: Uuid; step_id: string; output: string | null };
      }
    | {
        type: "component.answered";
        payload: { message_id: Uuid; component_id: Uuid; answer: unknown };
      }
    | { type: "attachment.added"; payload: { message_id: Uuid; asset: AssetRef } }
    | { type: "component.added"; payload: { message_id: Uuid; component: Component } }
    | { type: "reaction.added"; payload: { message_id: Uuid; emoji: string; by: Author } }
    | { type: "reaction.removed"; payload: { message_id: Uuid; emoji: string; by: Author } }
    | { type: "routing.answered"; payload: JevAnswers & { message_id: Uuid } }
  );

/** Jev's raw answers about a message, shown by the "Show Jev's answers" developer setting. */
export interface JevAnswers {
  answers: Record<
    string,
    { choice: string; confidence: number; probabilities: Record<string, number> }
  > | null;
  error: ErrorInfo | null;
}

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

export interface MiniMeColors {
  tint: string;
  solid: string;
  ink: string;
}

/** Which heading the `@` list shows a Mini-Me under. */
export type MiniMeGroup = "thinking" | "literature" | "data";

/** A Mini-Me as the UI lists and shows it. */
/** The avatar parts a Mini-Me is drawn with, by the ids of the avatar part files. */
export interface MiniMeAvatar {
  base: string;
  face: string;
  accessory?: string;
}

export interface MiniMe {
  id: Uuid;
  name: string;
  description: string;
  colors: MiniMeColors;
  avatar: MiniMeAvatar;
  group: MiniMeGroup;
}

export type ProviderId = "openai" | "anthropic" | "google" | "openrouter";

/** Every key the keychain can hold: the AI providers and Typesafe, which routes messages. */
export type KeyAccount = ProviderId | "typesafe";

/** The AI and routing settings. Saved keys are only named, never sent to the UI. */
export interface AiSettings {
  provider: ProviderId;
  model: string;
  saved_keys: KeyAccount[];
  /** Below this confidence in Jev's choice, the user is asked to mention a Mini-Me; 0 to 1. */
  threshold: number;
  /** Developer setting: store and show Jev's raw answers under each message. */
  show_answers: boolean;
}

/** The Ai2 account Asta's services sign in with. */
export type Ai2Status =
  | { state: "signed_out"; error: string | null }
  /** Waiting for the user to confirm `user_code` on Ai2's sign-in page. */
  | { state: "pending"; user_code: string; verification_uri: string }
  | { state: "signed_in"; email: string | null };
