import { useCallback, useEffect, useState, type ReactNode } from "react";
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { api, errorMessage } from "./api";
import { useDeveloperMode } from "./hooks/useDeveloperMode";
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

  // Outside Developer mode the webview's own right-click menu (Reload, Back, …) is kept only
  // in text fields, for cut, copy and paste.
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

  const refreshConversations = useCallback(async () => {
    if (!project) return;
    try {
      setConversations(await api.listConversations(project.id));
      // A reply can save files, so the file count follows Conversation activity.
      setFileCount((await api.listProjectFiles(project.id)).length);
    } catch (e) {
      fail(e);
    }
  }, [project]);

  useEffect(() => {
    setConversations([]);
    setFileCount(0);
    refreshConversations();
  }, [refreshConversations]);

  function navigate(next: View) {
    setError(null);
    if (next.kind === "home") setProject(null);
    setView(next);
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

  /** Shows a Conversation, at `messageId` when given, opening its Project first when another
   * is open. */
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
        fileCount={fileCount}
        onOpenProject={openProject}
        onNavigate={navigate}
        onNewConversation={newConversation}
        onOpenConversation={openConversation}
      />
      {/* The desk: the open view's sheets float on it, 12px from the window and each other. */}
      <SidebarInset className="h-svh min-w-0 flex-row gap-3 overflow-hidden bg-transparent p-3">
        <OpenSidebarButton />
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
  onNavigate: (view: View) => void;
  onOpenReply: (projectId: Uuid, conversationId: Uuid, messageId: Uuid) => void;
}) {
  // A Conversation and the Mini-Me editor lay out their own sheets; other views fill the main
  // sheet and scroll as a whole.
  const scrolling = (content: ReactNode) => (
    <MainSheet>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{content}</div>
    </MainSheet>
  );
  switch (view.kind) {
    case "settings":
      return scrolling(<SettingsView onOpenAvatars={() => onNavigate({ kind: "avatars" })} />);
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
          onOpenReply={onOpenReply}
          onOpenDocument={(assetId, draft) =>
            onNavigate({
              kind: "document",
              assetId,
              from: view,
              draftFrom: draft ? view.id : undefined,
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
          projectName={project.name}
          assetId={view.assetId}
          draftFrom={view.draftFrom}
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

/** Brings the sidebar back once it has been hidden. */
function OpenSidebarButton() {
  const { open } = useSidebar();
  if (open) return null;
  return <SidebarTrigger className="fixed top-5 left-5 z-20" />;
}
