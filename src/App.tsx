import { useCallback, useEffect, useState, type ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { api, errorMessage } from "./api";
import { useDeveloperMode } from "./hooks/useDeveloperMode";
import { useFilesChanged } from "./hooks/useFilesChanged";
import { useReplyNotifications } from "./hooks/useReplyNotifications";
import { useRunningKey } from "./hooks/useRunningReplies";
import { AvatarDebugView } from "./components/avatar/AvatarDebugView";
import { ChatView } from "./components/chat/ChatView";
import { DocumentView } from "./components/documents/DocumentView";
import { FilesView } from "./components/files/FilesView";
import { HomeView } from "./components/home/HomeView";
import { MiniMePlayground } from "./components/home/MiniMePlayground";
import { LibraryView } from "./components/library/LibraryView";
import { MiniMeEditor } from "./components/library/MiniMeEditor";
import { OverviewView } from "./components/overview/OverviewView";
import { SettingsView } from "./components/settings/SettingsView";
import { LicenseView } from "./components/shell/LicenseView";
import { ThirdPartyView } from "./components/shell/ThirdPartyView";
import { WhatsNewView } from "./components/shell/WhatsNewView";
import { AppSidebar } from "./components/shell/AppSidebar";
import { MainSheet } from "./components/shell/Sheet";
import type { View } from "./components/shell/view";
import { TraitEditor } from "./components/library/TraitEditor";
import type { ConversationSummary, ProjectSummary, Uuid } from "./protocol/types";

export default function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [fileCount, setFileCount] = useState(0);
  const [view, setView] = useState<View>({ kind: "home" });
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) => setError(errorMessage(e));
  const developer = useDeveloperMode();

  // Outside Developer mode only text fields keep the webview's context menu, for cut and paste.
  useEffect(() => {
    if (developer) return;
    const block = (event: MouseEvent) => {
      const target = event.target;
      const editable =
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest("input, textarea"));
      if (!editable) event.preventDefault();
    };
    window.addEventListener("contextmenu", block);
    return () => window.removeEventListener("contextmenu", block);
  }, [developer]);

  useEffect(() => {
    api.listProjects().then(setProjects).catch(fail);
  }, []);

  // Depends on the open Project's ID, not the object, so renaming it does not reload the lists.
  const projectId = project?.id;
  const refreshConversations = useCallback(async () => {
    if (!projectId) return;
    try {
      setConversations(await api.listConversations(projectId));
      // A reply can save files, so the file count follows Conversation activity.
      setFileCount((await api.listProjectFiles(projectId)).length);
    } catch (e) {
      fail(e);
    }
  }, [projectId]);

  useEffect(() => {
    setConversations([]);
    setFileCount(0);
    refreshConversations();
  }, [refreshConversations]);

  // Reload as replies run, pause and end, and as files change without a reply (a download).
  const runningKey = useRunningKey();
  const unseen = useReplyNotifications(view.kind === "conversation" ? view.id : null);
  const filesChanged = useFilesChanged(projectId);
  useEffect(() => {
    refreshConversations();
  }, [runningKey, filesChanged, refreshConversations]);

  // The first start after an update opens What's new once, over Home.
  useEffect(() => {
    api
      .takeWhatsNew()
      .then((show) => show && setView((from) => ({ kind: "whats-new", from })))
      .catch(() => {});
  }, []);

  function navigate(next: View) {
    setError(null);
    if (next.kind === "home") setProject(null);
    setView(next);
  }

  async function renameConversation(id: string, title: string) {
    if (!project) return;
    await api.renameConversation(project.id, id, title);
    await refreshConversations();
  }

  async function deleteConversation(id: string) {
    if (!project) return;
    await api.deleteConversation(project.id, id);
    if (view.kind === "conversation" && view.id === id) setView({ kind: "overview" });
    await refreshConversations();
  }

  async function renameProject(target: ProjectSummary, name: string) {
    const renamed = await api.renameProject(target.id, name);
    setProjects(await api.listProjects());
    if (project?.id === target.id) setProject(renamed);
  }

  async function deleteProject(target: ProjectSummary) {
    await api.deleteProject(target.id);
    setProjects(await api.listProjects());
    if (project?.id === target.id) navigate({ kind: "home" });
  }

  /** Opens a Project, then shows `next` in it. */
  async function openProject(summary: ProjectSummary, next: View = { kind: "overview" }) {
    try {
      setProject(await api.openProject(summary.id));
      setView(next);
      setError(null);
    } catch (e) {
      fail(e);
    }
  }

  async function createProject(name: string) {
    try {
      const created = await api.createProject(name);
      setProjects(await api.listProjects());
      await openProject(created);
    } catch (e) {
      fail(e);
    }
  }

  /** Shows a Conversation, at `messageId` if given, opening its Project first if needed. */
  async function openConversation(projectId: Uuid, conversationId: Uuid, messageId?: Uuid) {
    const next: View = { kind: "conversation", id: conversationId, messageId };
    if (project?.id === projectId) {
      navigate(next);
      return;
    }
    const summary = projects.find((p) => p.id === projectId);
    if (summary) await openProject(summary, next);
    else setError("That Project is no longer in Mini-Me Data.");
  }

  async function newConversation() {
    if (!project) return;
    try {
      const conversation = await api.createConversation(project.id);
      await refreshConversations();
      setView({ kind: "conversation", id: conversation.id });
    } catch (e) {
      fail(e);
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar
        view={view}
        project={project}
        projects={projects}
        conversations={conversations}
        unseen={unseen}
        fileCount={fileCount}
        onOpenProject={openProject}
        onNavigate={navigate}
        onNewConversation={newConversation}
        onOpenConversation={openConversation}
        onRenameConversation={renameConversation}
        onDeleteConversation={deleteConversation}
      />
      {/* The desk: the open view's sheets float on it, 12px from the window and each other. */}
      <SidebarInset className="h-svh min-w-0 flex-row gap-3 overflow-hidden bg-transparent p-3">
        {error && (
          <p
            role="alert"
            className="absolute top-5 left-1/2 z-30 -translate-x-1/2 rounded-full border border-border bg-card px-4 py-2 text-meta text-destructive"
          >
            {error}
          </p>
        )}
        <Main
          view={view}
          project={project}
          projects={projects}
          conversations={conversations}
          onOpenProject={openProject}
          onCreateProject={createProject}
          onConversationActivity={refreshConversations}
          onRenameConversation={renameConversation}
          onDeleteConversation={deleteConversation}
          onRenameProject={renameProject}
          onDeleteProject={deleteProject}
          onNavigate={navigate}
          onOpenReply={openConversation}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}

function Main({
  view,
  project,
  projects,
  conversations,
  onOpenProject,
  onCreateProject,
  onConversationActivity,
  onRenameConversation,
  onDeleteConversation,
  onRenameProject,
  onDeleteProject,
  onNavigate,
  onOpenReply,
}: {
  view: View;
  project: ProjectSummary | null;
  projects: ProjectSummary[];
  conversations: ConversationSummary[];
  onOpenProject: (project: ProjectSummary) => void;
  onCreateProject: (name: string) => Promise<void>;
  onConversationActivity: () => void;
  onRenameConversation: (id: string, title: string) => Promise<unknown>;
  onDeleteConversation: (id: string) => Promise<unknown>;
  onRenameProject: (project: ProjectSummary, name: string) => Promise<unknown>;
  onDeleteProject: (project: ProjectSummary) => Promise<unknown>;
  onNavigate: (view: View) => void;
  onOpenReply: (projectId: Uuid, conversationId: Uuid, messageId: Uuid) => void;
}) {
  // Views other than a Conversation and the Mini-Me editor fill one sheet and scroll as a whole.
  const scrolling = (content: ReactNode) => (
    <MainSheet>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{content}</div>
    </MainSheet>
  );
  switch (view.kind) {
    case "settings":
      return scrolling(
        <SettingsView
          initialPage={view.page}
          projectId={project?.id}
          onOpenAvatars={() => onNavigate({ kind: "avatars" })}
          onOpenWhatsNew={() =>
            onNavigate({ kind: "whats-new", from: { kind: "settings", page: "about" } })
          }
          onOpenLicense={() => onNavigate({ kind: "license" })}
          onOpenThirdParty={() => onNavigate({ kind: "third-party" })}
        />,
      );
    case "whats-new":
      return scrolling(<WhatsNewView onClose={() => onNavigate(view.from ?? { kind: "home" })} />);
    case "license":
      return scrolling(
        <LicenseView onClose={() => onNavigate({ kind: "settings", page: "about" })} />,
      );
    case "third-party":
      return scrolling(
        <ThirdPartyView onClose={() => onNavigate({ kind: "settings", page: "about" })} />,
      );
    case "avatars":
      // Opened from Settings → General, so closing it goes back there.
      return scrolling(<AvatarDebugView onClose={() => onNavigate({ kind: "settings" })} />);
    case "library":
      return scrolling(<LibraryView tab={view.tab ?? "mini-mes"} onOpen={onNavigate} />);
    case "mini-me":
      return (
        <MiniMeEditor
          key={`${view.id ?? ""}-${view.from ?? ""}`}
          id={view.id}
          from={view.from}
          onOpen={onNavigate}
          onBack={() => onNavigate({ kind: "library", tab: "mini-mes" })}
        />
      );
    case "trait":
      return scrolling(
        <TraitEditor
          key={`${view.id ?? ""}-${view.from ?? ""}`}
          id={view.id}
          from={view.from}
          onOpen={onNavigate}
          onBack={() => onNavigate({ kind: "library", tab: "traits" })}
        />,
      );
    case "overview":
      return project
        ? scrolling(
            <OverviewView
              key={project.id}
              project={project}
              onOpenConversation={(id, messageId) =>
                onNavigate({ kind: "conversation", id, messageId })
              }
              onOpenFiles={() => onNavigate({ kind: "files" })}
              onChanged={onConversationActivity}
              onOpenDocument={(assetId) => onNavigate({ kind: "document", assetId, from: view })}
              onRenameProject={(name) => onRenameProject(project, name)}
              onDeleteProject={() => onDeleteProject(project)}
            />,
          )
        : null;
    case "files":
      return project
        ? scrolling(
            <FilesView
              project={project}
              onOpenConversation={(id) => onNavigate({ kind: "conversation", id })}
              onOpenDocument={(assetId) => onNavigate({ kind: "document", assetId, from: view })}
              onChanged={onConversationActivity}
            />,
          )
        : null;
    case "conversation":
      return project ? (
        <ChatView
          key={`${view.id}-${view.messageId ?? ""}`}
          projectId={project.id}
          conversationId={view.id}
          messageId={view.messageId}
          title={conversations.find((c) => c.id === view.id)?.title ?? "Conversation"}
          onActivity={onConversationActivity}
          onRename={(newTitle) => onRenameConversation(view.id, newTitle)}
          onDelete={() => onDeleteConversation(view.id)}
          onOpenReply={onOpenReply}
          onOpenDocument={(assetId, how) =>
            onNavigate({
              kind: "document",
              assetId,
              from: view,
              draftFrom: how === "draft" ? view.id : undefined,
              edits: typeof how === "object" ? how.edits : undefined,
            })
          }
        />
      ) : null;
    case "document": {
      const from = view.from;
      const back =
        from.kind === "conversation"
          ? (conversations.find((c) => c.id === from.id)?.title ?? "Conversation")
          : from.kind === "files"
            ? "Files"
            : "Back";
      return project ? (
        <DocumentView
          key={view.assetId}
          projectId={project.id}
          assetId={view.assetId}
          draftFrom={view.draftFrom}
          edits={view.edits}
          back={back}
          onClose={() => onNavigate(from)}
        />
      ) : null;
    }
    case "home":
      return project ? (
        <MainSheet>
          <p className="m-auto text-muted-foreground">Select or create a conversation.</p>
        </MainSheet>
      ) : (
        // The Mini-Mes play behind Home's content; the content scrolls over them.
        <MainSheet>
          <MiniMePlayground />
          <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
            <HomeView
              projects={projects}
              onOpen={onOpenProject}
              onCreate={onCreateProject}
              onOpenReply={onOpenReply}
            />
          </div>
        </MainSheet>
      );
  }
}
