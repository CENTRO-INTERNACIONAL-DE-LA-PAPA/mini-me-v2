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
  kind: "asset" | "mini_me" | "component";
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
  /** The position in the reply's `steps` of the Step run whose Trait call added it; absent
   * when no Trait Step added it. */
  step_index?: number | null;
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

/** The Project Overview, as the core builds it. */
export interface Overview {
  conversations: number;
  /** The latest activity of any Conversation; null without Conversations. */
  last_activity_at: number | null;
  summary: string | null;
  summary_at: number | null;
  featured: FeaturedOutput | null;
  /** Newest first. */
  outputs: OverviewOutput[];
}

/** The component featured on the Overview, with its data, and the reply it belongs to. */
export interface FeaturedOutput {
  component: Component;
  author: Author;
  conversation_id: Uuid;
  message_id: Uuid;
}

/** Something a Conversation produced: a component other than an approval, or a file a
 * Mini-Me saved (`kind` is then `file` and `id` the Asset's). */
export interface OverviewOutput {
  kind: string;
  id: Uuid;
  title: string;
  author: Author;
  conversation_id: Uuid;
  conversation_title: string;
  message_id: Uuid;
  created_at: number;
}

/** A Conversation named in a listing, such as where a Project file is used. */
export interface ConversationRef {
  id: Uuid;
  title: string;
}

/** An Asset as the Project's Files screen lists it. */
export interface FileEntry extends AssetRef {
  /** `upload` for a file the user imported, `generated` for one a Mini-Me saved. */
  source: "upload" | "generated";
  created_at: number;
  /** The author of the first message the Asset is attached to, if any. */
  added_by: Author | null;
  /** The Conversations that attach or reference the Asset, in the order it first appeared. */
  used_in: ConversationRef[];
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
  built_in: boolean;
}

/** A node of a Workflow: a Trait Step or a control Step. */
export type WorkflowStep = { id: string; label?: string } & (
  | { type: "trait"; trait: Uuid }
  | { type: "approval"; prompt: string }
  | { type: "condition"; question: string; branches: WorkflowBranch[] }
  | { type: "loop"; question: string; max_iterations: number; steps: WorkflowStep[] }
  | { type: "parallel"; branches: WorkflowBranch[] }
);

export interface WorkflowBranch {
  label: string;
  steps: WorkflowStep[];
}

/** A Mini-Me with its Workflow, as its editor shows and saves it. */
export interface MiniMeDefinition extends MiniMe {
  workflow: { steps: WorkflowStep[] };
}

/** A Trait as the Library lists and edits it. */
export interface TraitSummary {
  id: Uuid;
  name: string;
  description: string;
  instructions: string | null;
  tools: string[];
  built_in: boolean;
  /** Whether it runs on its instructions; only such Traits can be duplicated. */
  prompt_based: boolean;
  /** The Mini-Mes whose Workflows run it. */
  used_by: Uuid[];
}

/** What a user edits of a Trait; a nil `id` creates a new one. */
export interface TraitDraft {
  id: Uuid;
  name: string;
  description: string;
  instructions: string;
  tools: string[];
}

/** A user-made entry of `user-library.json` left out because it breaks a rule. */
export interface SkippedEntry {
  kind: "trait" | "mini_me";
  name: string | null;
  problems: string[];
}

export interface LibraryView {
  mini_mes: MiniMe[];
  traits: TraitSummary[];
  skipped: SkippedEntry[];
  /** Why `user-library.json` could not be read; user-made definitions cannot change then. */
  unreadable: string | null;
}

export interface SavedDefinition {
  id: Uuid;
  library: LibraryView;
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
