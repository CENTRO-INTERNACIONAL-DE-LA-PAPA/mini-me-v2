import { useCallback, useEffect, useState, type ReactNode } from "react";
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { api, errorMessage } from "./api";
import { AvatarDebugView } from "./components/avatar/AvatarDebugView";
import { ChatView } from "./components/ChatView";
import { HomeView } from "./components/HomeView";
import { SettingsView } from "./components/SettingsView";
import { AppSidebar } from "./components/shell/AppSidebar";
import type { View } from "./components/shell/view";
import type { ConversationSummary, ProjectSummary } from "./protocol/types";

export default function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [view, setView] = useState<View>({ kind: "home" });
  // The view to return to when Settings or the avatar page is closed.
  const [previous, setPrevious] = useState<View>({ kind: "home" });
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) => setError(errorMessage(e));

  useEffect(() => {
    api.listProjects().then(setProjects).catch(fail);
  }, []);

  const refreshConversations = useCallback(async () => {
    if (!project) return;
    try {
      setConversations(await api.listConversations(project.id));
    } catch (e) {
      fail(e);
    }
  }, [project]);

  useEffect(() => {
    setConversations([]);
    refreshConversations();
  }, [refreshConversations]);

  function navigate(next: View) {
    setError(null);
    if (next.kind === "settings" || next.kind === "avatars") {
      if (view.kind !== "settings" && view.kind !== "avatars") setPrevious(view);
    } else if (next.kind === "home") {
      setProject(null);
    }
    setView(next);
  }

  async function openProject(summary: ProjectSummary) {
    try {
      setProject(await api.openProject(summary.id));
      setView({ kind: "home" });
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
        onOpenProject={openProject}
        onNavigate={navigate}
        onNewConversation={newConversation}
      />
      <SidebarInset className="h-svh min-w-0 overflow-hidden">
        <OpenSidebarButton />
        {error && <p className="px-8 pt-4 text-meta text-destructive">{error}</p>}
        <Main
          view={view}
          project={project}
          projects={projects}
          onOpenProject={openProject}
          onCreateProject={createProject}
          onConversationActivity={refreshConversations}
          onBack={() => setView(previous)}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}

function Main({
  view,
  project,
  projects,
  onOpenProject,
  onCreateProject,
  onConversationActivity,
  onBack,
}: {
  view: View;
  project: ProjectSummary | null;
  projects: ProjectSummary[];
  onOpenProject: (project: ProjectSummary) => void;
  onCreateProject: (name: string) => Promise<void>;
  onConversationActivity: () => void;
  onBack: () => void;
}) {
  // A Conversation scrolls its message list itself, above the composer; other views scroll
  // as a whole.
  const scrolling = (content: ReactNode) => (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{content}</div>
  );
  switch (view.kind) {
    case "settings":
      return scrolling(<SettingsView onClose={onBack} />);
    case "avatars":
      return scrolling(<AvatarDebugView onClose={onBack} />);
    case "conversation":
      return project ? (
        <ChatView
          key={view.id}
          projectId={project.id}
          conversationId={view.id}
          onActivity={onConversationActivity}
        />
      ) : null;
    case "home":
      return project ? (
        <p className="m-auto text-muted-foreground">Select or create a conversation.</p>
      ) : (
        scrolling(
          <HomeView projects={projects} onOpen={onOpenProject} onCreate={onCreateProject} />,
        )
      );
  }
}

/** Brings the sidebar back once it has been hidden. */
function OpenSidebarButton() {
  const { open } = useSidebar();
  if (open) return null;
  return <SidebarTrigger className="fixed top-3 left-3 z-20" />;
}
