import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  CheckIcon,
  ChevronDownIcon,
  FolderIcon,
  HomeIcon,
  LayoutGridIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useUserProfile } from "../../hooks/useUserProfile";
import { initials } from "../../lib/names";
import type {
  ConversationSummary,
  ProjectSummary,
  RecentConversation,
  Uuid,
} from "../../protocol/types";
import { formatRelative } from "../../lib/format";
import { MiniMeAvatar } from "../minime/MiniMeAvatar";
import { SidecarStatusLine, useSidecarStatus } from "./SidecarStatusLine";
import { UpdateStatusLine } from "./UpdateStatusLine";
import { useMiniMes } from "../../hooks/useMiniMes";
import type { View } from "./view";
import { Wordmark } from "./Wordmark";

interface Props {
  view: View;
  project: ProjectSummary | null;
  projects: ProjectSummary[];
  conversations: ConversationSummary[];
  /** How many files the open Project holds. */
  fileCount: number;
  onOpenProject: (project: ProjectSummary) => void;
  onNavigate: (view: View) => void;
  onNewConversation: () => void;
  onOpenConversation: (projectId: Uuid, conversationId: Uuid) => void;
}

export function AppSidebar({
  view,
  project,
  projects,
  conversations,
  fileCount,
  onOpenProject,
  onNavigate,
  onNewConversation,
  onOpenConversation,
}: Props) {
  const sidecar = useSidecarStatus();
  const name = useUserProfile()?.name;
  const onHome = !project && view.kind === "home";
  const [recent, setRecent] = useState<RecentConversation[]>([]);

  // Fetched each time Home is shown, so it follows activity in any Project.
  useEffect(() => {
    if (!onHome) return;
    let active = true;
    api
      .listRecentConversations()
      .then((list) => active && setRecent(list))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [onHome]);

  return (
    <Sidebar variant="floating">
      <SidebarHeader className="gap-[22px] px-3.5 pt-5 pb-0">
        <div className="flex items-center justify-between px-2">
          <Wordmark height={16} />
          <SidebarTrigger />
        </div>
        <ProjectSwitcher
          project={project}
          projects={projects}
          onOpen={onOpenProject}
          onHome={() => onNavigate({ kind: "home" })}
        />
      </SidebarHeader>
      <SidebarContent className="gap-[22px] px-1.5 pt-[22px]">
        {!project && (
          <SidebarGroup className="py-0">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={view.kind === "home"}
                  onClick={() => onNavigate({ kind: "home" })}
                >
                  <HomeIcon />
                  <span>Home</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}
        {project && (
          <SidebarGroup className="py-0">
            <SidebarMenu className="gap-0.5">
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={view.kind === "overview"}
                  onClick={() => onNavigate({ kind: "overview" })}
                >
                  <LayoutGridIcon />
                  <span>Overview</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={view.kind === "files"}
                  onClick={() => onNavigate({ kind: "files" })}
                >
                  <FolderIcon />
                  <span>Files</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="font-normal text-muted-foreground">
                  {fileCount}
                </SidebarMenuBadge>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}
        {!project && recent.length > 0 && (
          <SidebarGroup className="py-0">
            <SidebarGroupLabel className="h-auto px-2.5 pt-0 pb-1.5 font-serif text-subheading font-normal text-foreground">
              Recent
            </SidebarGroupLabel>
            <SidebarMenu className="gap-1">
              {recent.map((conversation) => (
                <SidebarMenuItem key={conversation.conversation_id}>
                  <SidebarMenuButton
                    size="lg"
                    className="h-auto flex-col items-start gap-0 py-[9px]"
                    onClick={() =>
                      onOpenConversation(conversation.project_id, conversation.conversation_id)
                    }
                  >
                    <span className="w-full truncate text-foreground">{conversation.title}</span>
                    <span className="w-full truncate text-meta font-normal text-muted-foreground">
                      {conversation.project_name} · {formatRelative(conversation.last_activity_at)}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}
        {project && (
          <SidebarGroup className="py-0">
            <div className="flex items-center justify-between pr-1 pb-1.5 pl-2.5">
              <SidebarGroupLabel className="h-auto p-0 font-serif text-subheading font-normal text-foreground">
                Conversations
              </SidebarGroupLabel>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="New conversation"
                title="New conversation"
                onClick={onNewConversation}
              >
                <PlusIcon />
              </Button>
            </div>
            <SidebarMenu className="gap-1">
              {conversations.map((conversation) => {
                const active = view.kind === "conversation" && view.id === conversation.id;
                return (
                  <SidebarMenuItem key={conversation.id}>
                    <SidebarMenuButton
                      size="lg"
                      isActive={active}
                      className="h-auto flex-col items-start gap-0 py-[9px]"
                      onClick={() => onNavigate({ kind: "conversation", id: conversation.id })}
                    >
                      <span className="w-full truncate text-foreground">{conversation.title}</span>
                      <span className="text-meta font-normal text-muted-foreground">
                        {formatRelative(conversation.last_activity_at)}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              {conversations.length === 0 && (
                <p className="px-2.5 text-meta text-muted-foreground">No conversations yet.</p>
              )}
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="gap-3 px-3.5 pb-3.5">
        <div className="grid gap-2 px-2">
          <SidecarStatusLine status={sidecar} />
          <UpdateStatusLine />
        </div>
        {/* The Mini-Mes stack opens the Library; your avatar opens Settings. */}
        <div className="flex items-center gap-1 rounded-well bg-card p-1">
          <Button
            variant="ghost"
            aria-pressed={["library", "mini-me", "trait"].includes(view.kind)}
            onClick={() => onNavigate({ kind: "library" })}
            className="h-auto min-w-0 flex-1 justify-start gap-2.5 rounded-control px-1.5 py-1.5 text-control font-normal text-foreground aria-pressed:bg-accent aria-pressed:font-medium aria-pressed:text-foreground"
          >
            <AvatarStack />
            <span className="truncate">Mini-Mes</span>
          </Button>
          <Button
            size="icon"
            aria-label="Settings"
            title={name ? `${name} · Settings` : "Settings"}
            aria-pressed={view.kind === "settings"}
            onClick={() => onNavigate({ kind: "settings" })}
            className="rounded-full text-[10px] font-semibold aria-pressed:ring-2 aria-pressed:ring-border-strong"
          >
            {name ? initials(name) : <SettingsIcon />}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

/** Mini-Mes the Library entry shows, one per group, overlapping by about a third. */
const STACKED = ["Researcher", "Curator", "Planner"];

function AvatarStack() {
  const miniMes = useMiniMes();
  const shown = STACKED.map((name) => miniMes.find((m) => m.name === name)).filter(
    (m) => m !== undefined,
  );
  return (
    // Buttons size every svg as an icon; avatar bodies are svgs that fill their box.
    <span className="flex shrink-0 [&_svg]:size-full!">
      {shown.map((m, i) => (
        <MiniMeAvatar key={m.id} miniMe={m} size={20} className={i > 0 ? "-ml-1.5" : undefined} />
      ))}
    </span>
  );
}

/** The open Project at the top of the navigation: a "Project" switcher above its serif name,
 * or a dashed card when none is open. Its menu switches to another Project. */
function ProjectSwitcher({
  project,
  projects,
  onOpen,
  onHome,
}: {
  project: ProjectSummary | null;
  projects: ProjectSummary[];
  onOpen: (project: ProjectSummary) => void;
  onHome: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className={cn(
              "flex w-full cursor-pointer flex-col items-start gap-2 rounded-xl text-left outline-none",
              "focus-visible:outline-2 focus-visible:outline-ring",
              project
                ? "px-2 [&:hover_.switcher-label]:text-foreground"
                : "border border-dashed border-dash px-3 py-3 transition-colors duration-150 hover:bg-sidebar-accent",
            )}
          />
        }
      >
        {project ? (
          <>
            <span className="switcher-label flex items-center gap-1 text-meta text-muted-foreground transition-colors duration-150">
              Project
              <ChevronDownIcon className="size-3.5" />
            </span>
            <span className="line-clamp-2 font-serif text-nav-project font-medium text-foreground">
              {project.name}
            </span>
          </>
        ) : (
          <span className="grid leading-tight">
            <span className="font-medium text-foreground">No project open</span>
            <span className="text-meta text-muted-foreground">Choose one or start new</span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Projects</DropdownMenuLabel>
          {projects.map((p) => (
            <DropdownMenuItem key={p.id} onClick={() => onOpen(p)}>
              <span className="flex-1 truncate">{p.name}</span>
              {p.id === project?.id && <CheckIcon />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onHome}>
          <HomeIcon />
          All projects
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
