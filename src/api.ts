import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  AppError,
  Ai2Status,
  AiSettings,
  AssetRef,
  KeyAccount,
  ConversationSummary,
  Message,
  MiniMe,
  ProjectSummary,
  ProtocolEvent,
  ProviderId,
  SendMessageInput,
  SidecarStatus,
  UpdateStatus,
  Uuid,
} from "./protocol/types";

export const api = {
  listProjects: () => invoke<ProjectSummary[]>("list_projects"),
  createProject: (name: string) => invoke<ProjectSummary>("create_project", { name }),
  openProject: (project_id: Uuid) => invoke<ProjectSummary>("open_project", { project_id }),

  listConversations: (project_id: Uuid) =>
    invoke<ConversationSummary[]>("list_conversations", { project_id }),
  createConversation: (project_id: Uuid) =>
    invoke<ConversationSummary>("create_conversation", { project_id }),

  /** Streams every event after `after_seq`, then new events as they are persisted. */
  subscribeConversation: (
    project_id: Uuid,
    conversation_id: Uuid,
    after_seq: number,
    onEvent: (event: ProtocolEvent) => void,
  ) => {
    const on_event = new Channel<ProtocolEvent>();
    on_event.onmessage = onEvent;
    return invoke<void>("subscribe_conversation", {
      project_id,
      conversation_id,
      after_seq,
      on_event,
    });
  },

  sendMessage: (project_id: Uuid, conversation_id: Uuid, input: SendMessageInput) =>
    invoke<Message>("send_message", { project_id, conversation_id, input }),
  stopReply: (project_id: Uuid, conversation_id: Uuid) =>
    invoke<void>("stop_reply", { project_id, conversation_id }),

  addReaction: (project_id: Uuid, message_id: Uuid, emoji: string) =>
    invoke<void>("add_reaction", { project_id, message_id, emoji }),
  removeReaction: (project_id: Uuid, message_id: Uuid, emoji: string) =>
    invoke<void>("remove_reaction", { project_id, message_id, emoji }),

  /** Opens the native file picker; resolves with the imported Assets (empty if cancelled). */
  importAssets: (project_id: Uuid) => invoke<AssetRef[]>("import_assets", { project_id }),
  listAssets: (project_id: Uuid, query: string) =>
    invoke<AssetRef[]>("list_assets", { project_id, query }),
  openAsset: (project_id: Uuid, asset_id: Uuid) =>
    invoke<void>("open_asset", { project_id, asset_id }),

  getSidecarStatus: () => invoke<SidecarStatus>("get_sidecar_status"),
  /** Calls `onStatus` with the current sidecar status, then with every change. */
  subscribeSidecarStatus: (onStatus: (status: SidecarStatus) => void) => {
    const on_status = new Channel<SidecarStatus>();
    on_status.onmessage = onStatus;
    return invoke<void>("subscribe_sidecar_status", { on_status });
  },
  /** Starts the sidecar again after it stopped. */
  restartSidecar: () => invoke<void>("restart_sidecar"),

  listMiniMes: () => invoke<MiniMe[]>("list_mini_mes"),

  getAiSettings: () => invoke<AiSettings>("get_ai_settings"),
  setAiModel: (provider: ProviderId, model: string) =>
    invoke<void>("set_ai_model", { provider, model }),
  /** Stores the key in the OS keychain; it is never sent back to the UI. */
  saveApiKey: (provider: KeyAccount, key: string) =>
    invoke<void>("save_api_key", { provider, key }),
  removeApiKey: (provider: KeyAccount) => invoke<void>("remove_api_key", { provider }),
  setRoutingThreshold: (threshold: number) => invoke<void>("set_routing_threshold", { threshold }),
  setShowJevAnswers: (show: boolean) => invoke<void>("set_show_jev_answers", { show }),

  /** Opens Ai2's sign-in page; the status then turns `pending` and later `signed_in`. */
  ai2StartSignIn: () => invoke<void>("ai2_start_sign_in"),
  /** Calls `onStatus` with the current Ai2 account status, then with every change. */
  subscribeAi2Status: (onStatus: (status: Ai2Status) => void) => {
    const on_status = new Channel<Ai2Status>();
    on_status.onmessage = onStatus;
    return invoke<void>("subscribe_ai2_status", { on_status });
  },
  ai2SignOut: () => invoke<void>("ai2_sign_out"),


  getUpdateStatus: () => invoke<UpdateStatus>("get_update_status"),
  /** Calls `onStatus` with the current update status, then with every change. */
  subscribeUpdateStatus: (onStatus: (status: UpdateStatus) => void) => {
    const on_status = new Channel<UpdateStatus>();
    on_status.onmessage = onStatus;
    return invoke<void>("subscribe_update_status", { on_status });
  },
  /** Installs the downloaded update and restarts the app. */
  restartToUpdate: () => invoke<void>("restart_to_update"),
};

export function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as AppError).message);
  }
  return String(error);
}

export function errorCode(error: unknown): string | null {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as AppError).code);
  }
  return null;
}
