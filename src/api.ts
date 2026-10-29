import { Channel, invoke } from "@tauri-apps/api/core";
import type { OpenedConversation } from "./protocol/eventStore";
import type {
  AppError,
  Ai2Status,
  AiSettings,
  AssetRef,
  KeyAccount,
  ConversationSummary,
  DraftEvent,
  LibraryView,
  FileEntry,
  HomeSettings,
  Message,
  MiniMe,
  MiniMeDefinition,
  OpenedDocument,
  Overview,
  PausedApproval,
  ProjectSummary,
  ProtocolEvent,
  ProviderId,
  RecentConversation,
  RunningReply,
  SavedDefinition,
  SendMessageInput,
  SidecarStatus,
  TraitDraft,
  UpdateStatus,
  UserProfile,
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

  /** The Conversation as stored, and a subscription that sends `onEvents` every event
   * persisted after it, in batches. A batch can arrive before the returned state. */
  openConversation: (
    project_id: Uuid,
    conversation_id: Uuid,
    onEvents: (events: ProtocolEvent[]) => void,
  ) => {
    const on_events = new Channel<ProtocolEvent[]>();
    on_events.onmessage = onEvents;
    return invoke<OpenedConversation>("open_conversation", {
      project_id,
      conversation_id,
      on_events,
    });
  },
  unsubscribeConversation: (project_id: Uuid, subscription_id: Uuid) =>
    invoke<void>("unsubscribe_conversation", { project_id, subscription_id }),
  /** Ends every Conversation subscription, including those of a view before a reload. */
  resetSubscriptions: () => invoke<void>("reset_subscriptions"),

  sendMessage: (project_id: Uuid, conversation_id: Uuid, input: SendMessageInput) =>
    invoke<Message>("send_message", { project_id, conversation_id, input }),
  stopReply: (project_id: Uuid, conversation_id: Uuid) =>
    invoke<void>("stop_reply", { project_id, conversation_id }),
  /** Answers the approval a paused reply waits for; approving resumes its Workflow. */
  answerApproval: (project_id: Uuid, message_id: Uuid, component_id: Uuid, approved: boolean) =>
    invoke<void>("answer_approval", { project_id, message_id, component_id, approved }),
  /** Every reply paused at an approval, across all Projects, newest first. */
  listPausedApprovals: () => invoke<PausedApproval[]>("list_paused_approvals"),
  /** The most recently active Conversations across all Projects, newest first. */
  listRecentConversations: () => invoke<RecentConversation[]>("list_recent_conversations"),


  /** Opens the native file picker; resolves with the imported Assets (empty if cancelled). */
  importAssets: (project_id: Uuid) => invoke<AssetRef[]>("import_assets", { project_id }),
  listAssets: (project_id: Uuid, query: string) =>
    invoke<AssetRef[]>("list_assets", { project_id, query }),
  /** Imports an image pasted into the composer, sent as raw bytes. */
  importPastedImage: (project_id: Uuid, image: File) =>
    image.arrayBuffer().then((bytes) =>
      invoke<AssetRef>("import_pasted_image", new Uint8Array(bytes), {
        headers: {
          "project-id": project_id,
          "media-type": image.type,
          name: encodeURIComponent(image.name),
        },
      }),
    ),
  /** Imports files dropped on the window; the core accepts only the paths of the latest drop. */
  importDropped: (project_id: Uuid, paths: string[]) =>
    invoke<AssetRef[]>("import_dropped", { project_id, paths }),
  /** The bytes of a PNG, JPEG, GIF or WebP Asset, for its thumbnail. */
  readImageAsset: (project_id: Uuid, asset_id: Uuid) =>
    invoke<ArrayBuffer>("read_image_asset", { project_id, asset_id }),
  getOverview: (project_id: Uuid) => invoke<Overview>("get_overview", { project_id }),
  /** Features a chart or table on the Overview; `null` clears it. */
  featureComponent: (project_id: Uuid, component_id: Uuid | null) =>
    invoke<void>("feature_component", { project_id, component_id }),
  /** Asks the model chosen in Settings for a new summary; resolves with the updated Overview. */
  updateOverviewSummary: (project_id: Uuid) =>
    invoke<Overview>("update_overview_summary", { project_id }),
  /** Every Asset of the Project, newest first, with who added it and where it is used. */
  listProjectFiles: (project_id: Uuid) => invoke<FileEntry[]>("list_project_files", { project_id }),
  openAsset: (project_id: Uuid, asset_id: Uuid) =>
    invoke<void>("open_asset", { project_id, asset_id }),
  /** Creates an empty `.qmd` document titled `title`, with the user's name as author. */
  createDocument: (project_id: Uuid, title: string) =>
    invoke<AssetRef>("create_document", { project_id, title }),
  readDocument: (project_id: Uuid, asset_id: Uuid) =>
    invoke<OpenedDocument>("read_document", { project_id, asset_id }),
  saveDocument: (project_id: Uuid, asset_id: Uuid, text: string) =>
    invoke<void>("save_document", { project_id, asset_id, text }),
  /** Drafts the new document `asset_id` from a Conversation, calling `onEvent` as text arrives.
   * Resolves once the draft has ended and what was written is saved; rejects with why it
   * stopped early. */
  draftDocument: (
    project_id: Uuid,
    asset_id: Uuid,
    conversation_id: Uuid,
    draft_id: Uuid,
    onEvent: (event: DraftEvent) => void,
  ) => {
    const on_event = new Channel<DraftEvent>();
    on_event.onmessage = onEvent;
    return invoke<void>("draft_document", {
      project_id,
      asset_id,
      conversation_id,
      draft_id,
      on_event,
    });
  },
  stopDraft: (draft_id: Uuid) => invoke<void>("stop_draft", { draft_id }),
  /** The document text `source` as it would export, one SVG image per page. */
  previewDocument: (source: string) => invoke<string[]>("preview_document", { source }),
  /** Saves the document as a PDF Asset named after it, and returns that Asset. */
  exportDocumentPdf: (project_id: Uuid, asset_id: Uuid) =>
    invoke<AssetRef>("export_document_pdf", { project_id, asset_id }),

  /** Calls `onChange` with the running replies, then with the whole list on every change. */
  subscribeRunningReplies: (onChange: (running: RunningReply[]) => void) => {
    const on_change = new Channel<RunningReply[]>();
    on_change.onmessage = onChange;
    return invoke<void>("subscribe_running_replies", { on_change });
  },
  /** Calls `onStatus` with the current sidecar status, then with every change. */
  subscribeSidecarStatus: (onStatus: (status: SidecarStatus) => void) => {
    const on_status = new Channel<SidecarStatus>();
    on_status.onmessage = onStatus;
    return invoke<void>("subscribe_sidecar_status", { on_status });
  },
  /** Starts the sidecar again after it stopped. */
  restartSidecar: () => invoke<void>("restart_sidecar"),

  listMiniMes: () => invoke<MiniMe[]>("list_mini_mes"),
  listLibrary: () => invoke<LibraryView>("list_library"),
  getMiniMe: (id: Uuid) => invoke<MiniMeDefinition>("get_mini_me", { id }),
  /** Creates the Mini-Me when its `id` is nil, else replaces it. */
  saveMiniMe: (miniMe: MiniMeDefinition) =>
    invoke<SavedDefinition>("save_mini_me", { mini_me: miniMe }),
  saveTrait: (draft: TraitDraft) => invoke<SavedDefinition>("save_trait", { draft }),
  deleteMiniMe: (id: Uuid) => invoke<LibraryView>("delete_mini_me", { id }),
  deleteTrait: (id: Uuid) => invoke<LibraryView>("delete_trait", { id }),

  getUserProfile: () => invoke<UserProfile>("get_user_profile"),
  /** Saves the trimmed name; an empty name clears it. */
  saveUserName: (name: string) => invoke<UserProfile>("save_user_name", { name }),

  getAiSettings: () => invoke<AiSettings>("get_ai_settings"),
  setAiModel: (provider: ProviderId, model: string) =>
    invoke<void>("set_ai_model", { provider, model }),
  /** Stores the key in the OS keychain; it is never sent back to the UI. */
  saveApiKey: (provider: KeyAccount, key: string) =>
    invoke<void>("save_api_key", { provider, key }),
  removeApiKey: (provider: KeyAccount) => invoke<void>("remove_api_key", { provider }),
  setRoutingThreshold: (threshold: number) => invoke<void>("set_routing_threshold", { threshold }),
  setShowJevAnswers: (show: boolean) => invoke<void>("set_show_jev_answers", { show }),
  /** Whether developer options are shown: on in Mini-Me Dev and off in Mini-Me until set. */
  getDeveloperMode: () => invoke<boolean>("get_developer_mode"),
  setDeveloperMode: (on: boolean) => invoke<void>("set_developer_mode", { on }),
  getHomeSettings: () => invoke<HomeSettings>("get_home_settings"),
  setShowHomeMiniMes: (show: boolean) => invoke<void>("set_show_home_mini_mes", { show }),

  /** Opens Ai2's sign-in page; the status then turns `pending` and later `signed_in`. */
  ai2StartSignIn: () => invoke<void>("ai2_start_sign_in"),
  /** Calls `onStatus` with the current Ai2 account status, then with every change. */
  subscribeAi2Status: (onStatus: (status: Ai2Status) => void) => {
    const on_status = new Channel<Ai2Status>();
    on_status.onmessage = onStatus;
    return invoke<void>("subscribe_ai2_status", { on_status });
  },
  ai2SignOut: () => invoke<void>("ai2_sign_out"),


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
