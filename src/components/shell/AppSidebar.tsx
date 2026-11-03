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
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  CheckIcon,
  ChevronDownIcon,
  CompassIcon,
  FolderIcon,
  HomeIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import { RoutingWarningLine } from "./RoutingWarningLine";
import { SidecarStatusLine, sidecarReady, useSidecarStatus } from "./SidecarStatusLine";
import { ItemMenu } from "./ItemMenu";
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
  onRenameConversation: (id: Uuid, title: string) => Promise<unknown>;
  onDeleteConversation: (id: Uuid) => Promise<unknown>;
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
  onRenameConversation,
  onDeleteConversation,
}: Props) {
  const sidecar = useSidecarStatus();
  // The navigation sheet shrinks to a rail of icons when a tool sheet opens in a small window.
  const collapsed = useSidebar().state === "collapsed";
  const name = useUserProfile()?.name;
  const onHome = !project && view.kind === "home";
  const [recent, setRecent] = useState<RecentConversation[]>([]);

  const loadRecent = useCallback(() => api.listRecentConversations().then(setRecent), []);

  // Fetched each time Home is shown, so it follows activity in any Project.
  useEffect(() => {
    if (onHome) loadRecent().catch(() => {});
  }, [onHome, loadRecent]);

  return (
    <Sidebar variant="floating" collapsible="icon">
      <SidebarHeader className="gap-[22px] px-3.5 pt-5 pb-0">
        <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between px-2")}>
          {!collapsed && (
            <button
              type="button"
              title="Home"
              aria-label="Home"
              onClick={() => onNavigate({ kind: "home" })}
              className="cursor-pointer rounded-control outline-none focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Wordmark height={16} />
            </button>
          )}
          <SidebarTrigger title={collapsed ? "Show navigation" : undefined} />
        </div>
        {/* Collapsed, there is no wordmark and no switcher: expanding leads Home. */}
        {!collapsed && (
          <ProjectSwitcher
            project={project}
            projects={projects}
            onOpen={onOpenProject}
            onHome={() => onNavigate({ kind: "home" })}
          />
        )}
      </SidebarHeader>
      <SidebarContent className="gap-[22px] px-1.5 pt-[22px]">
        {project && (
          <SidebarGroup className="py-0">
            <SidebarMenu className="gap-0.5">
              <SidebarMenuItem>
                <SidebarMenuButton
                  title="Overview"
                  isActive={view.kind === "overview"}
                  onClick={() => onNavigate({ kind: "overview" })}
                >
                  <CompassIcon />
                  <span>Overview</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  title="Files"
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
        {!project && !collapsed && recent.length > 0 && (
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
                  <ItemMenu
                    name={conversation.title}
                    className="absolute top-1/2 right-1.5 -translate-y-1/2 opacity-0 group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 aria-expanded:opacity-100"
                    rename={{
                      current: conversation.title,
                      onRename: (title) =>
                        api
                          .renameConversation(conversation.project_id, conversation.conversation_id, title)
                          .then(loadRecent),
                    }}
                    remove={{
                      question: `Delete "${conversation.title}" and its messages? This can't be undone.`,
                      onDelete: () =>
                        api
                          .deleteConversation(conversation.project_id, conversation.conversation_id)
                          .then(loadRecent),
                    }}
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}
        {project && (
          <SidebarGroup className="py-0">
            <div
              className={cn(
                "flex items-center pb-1.5",
                collapsed ? "justify-center" : "justify-between pr-1 pl-2.5",
              )}
            >
              <SidebarGroupLabel
                className={cn(
                  "h-auto p-0 font-serif text-subheading font-normal text-foreground",
                  collapsed && "hidden",
                )}
              >
                Conversations
              </SidebarGroupLabel>
              <Button
                variant={collapsed ? "default" : "ghost"}
                size="icon-sm"
                aria-label="New conversation"
                title="New conversation"
                onClick={onNewConversation}
              >
                <PlusIcon />
              </Button>
            </div>
            <SidebarMenu className={cn("gap-1", collapsed && "hidden")}>
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
                    <ItemMenu
                      name={conversation.title}
                      className="absolute top-1/2 right-1.5 -translate-y-1/2 opacity-0 group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 aria-expanded:opacity-100"
                      rename={{
                        current: conversation.title,
                        onRename: (title) => onRenameConversation(conversation.id, title),
                      }}
                      remove={{
                        question: `Delete "${conversation.title}" and its messages? This can't be undone.`,
                        onDelete: () => onDeleteConversation(conversation.id),
                      }}
                    />
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
      <SidebarFooter className={cn("gap-3 pb-3.5", collapsed ? "px-2" : "px-3.5")}>
        {!collapsed && (
          <div className="grid gap-2 px-2">
            <SidecarStatusLine status={sidecar} />
            {sidecarReady(sidecar) && <RoutingWarningLine />}
            <UpdateStatusLine />
          </div>
        )}
        {/* The Mini-Mes stack opens the Library; your avatar opens Settings. */}
        <div
          className={cn("flex items-center gap-1 rounded-well bg-card p-1", collapsed && "flex-col")}
        >
          <Button
            variant="ghost"
            title="Mini-Mes"
            aria-pressed={["library", "mini-me", "trait"].includes(view.kind)}
            onClick={() => onNavigate({ kind: "library" })}
            className={cn(
              "h-auto min-w-0 rounded-control px-1.5 py-1.5 text-control font-normal text-foreground aria-pressed:bg-accent aria-pressed:font-medium aria-pressed:text-foreground",
              collapsed ? "w-full justify-center" : "flex-1 justify-start gap-2.5",
            )}
          >
            <AvatarStack limit={collapsed ? 1 : STACKED.length} />
            {!collapsed && <span className="truncate">Mini-Mes</span>}
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

function AvatarStack({ limit }: { limit: number }) {
  const miniMes = useMiniMes();
  const shown = STACKED.slice(0, limit).map((name) => miniMes.find((m) => m.name === name)).filter(
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
