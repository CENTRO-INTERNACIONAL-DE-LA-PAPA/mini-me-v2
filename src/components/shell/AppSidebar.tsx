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
import type {
  ConversationSummary,
  ProjectSummary,
  RecentConversation,
  Uuid,
} from "../../protocol/types";
import { formatRelative } from "../../lib/format";
import { MiniMeAvatar } from "../minime/MiniMeAvatar";
import { ConversationStatusLine } from "./ConversationStatusLine";
import { RoutingWarningLine } from "./RoutingWarningLine";
import { SidecarStatusLine, sidecarReady, useSidecarStatus } from "./SidecarStatusLine";
import { DOTS_HOVER, ItemMenu } from "./ItemMenu";
import { UpdateStatusLine } from "./UpdateStatusLine";
import { useMiniMes } from "../../hooks/useMiniMes";
import { useRunningKey } from "../../hooks/useRunningReplies";
import { useUserProfile } from "../../hooks/useUserProfile";
import { initials } from "../../lib/names";
import type { View } from "./view";
import { Wordmark } from "./Wordmark";

interface Props {
  view: View;
  project: ProjectSummary | null;
  projects: ProjectSummary[];
  conversations: ConversationSummary[];
  /** Conversations whose reply finished, failed or paused while they were not open. */
  unseen: ReadonlySet<Uuid>;
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
  unseen,
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

  // Refetched when Home shows and when a reply starts or stops, so activity and statuses follow.
  const runningKey = useRunningKey();
  useEffect(() => {
    if (onHome) loadRecent().catch(() => {});
  }, [onHome, loadRecent, runningKey]);

  return (
    <Sidebar variant="floating" collapsible="icon">
      <SidebarHeader className="gap-5.5 px-3.5 pt-5 pb-0">
        <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between px-2")}>
          {!collapsed && (
            <button
              type="button"
              title="Home"
              aria-label="Home"
              onClick={() => onNavigate({ kind: "home" })}
              className="cursor-pointer rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Wordmark height={16} />
            </button>
          )}
          <SidebarTrigger title={collapsed ? "Show navigation" : undefined} />
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-5.5 px-1.5 pt-5.5">
        <SidebarGroup className="py-0">
          <SidebarMenu className="gap-0.5">
            <SidebarMenuItem>
              <SidebarMenuButton
                title="Home"
                isActive={view.kind === "home"}
                onClick={() => onNavigate({ kind: "home" })}
              >
                <HomeIcon />
                <span>Home</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                title="Mini-Mes"
                className="mini-me-stack"
                isActive={["library", "mini-me", "trait"].includes(view.kind)}
                onClick={() => onNavigate({ kind: "library" })}
              >
                <AvatarStack limit={collapsed ? 1 : STACKED.length} />
                <span>Mini-Mes</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup className="gap-1.5 py-0">
          {/* Collapsed, there is no wordmark and no switcher: the Home row leads Home. */}
          {!collapsed && (
            <ProjectSwitcher
              project={project}
              projects={projects}
              onOpen={onOpenProject}
              onHome={() => onNavigate({ kind: "home" })}
            />
          )}
          {project && (
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
          )}
        </SidebarGroup>
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
                    className={cn("h-auto flex-col items-start gap-0 py-2.5 pr-9", ROW_HOVER)}
                    onClick={() =>
                      onOpenConversation(conversation.project_id, conversation.conversation_id)
                    }
                  >
                    <ConversationTitle
                      title={conversation.title}
                      unseen={unseen.has(conversation.conversation_id)}
                    />
                    {conversation.status ? (
                      <ConversationStatusLine status={conversation.status} />
                    ) : (
                      <span className="w-full truncate text-meta font-normal text-muted-foreground">
                        {conversation.project_name} ({formatRelative(conversation.last_activity_at)})
                      </span>
                    )}
                  </SidebarMenuButton>
                  <ItemMenu
                    name={conversation.title}
                    className={cn(ROW_MENU, DOTS_HOVER)}
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
                Conversations{conversations.length > 0 && ` (${conversations.length})`}
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
                      className={cn(
                        "h-auto flex-col items-start gap-0 py-2.5 pr-9",
                        !active && ROW_HOVER,
                      )}
                      onClick={() => onNavigate({ kind: "conversation", id: conversation.id })}
                    >
                      <ConversationTitle
                        title={conversation.title}
                        unseen={unseen.has(conversation.id)}
                      />
                      {conversation.status ? (
                        <ConversationStatusLine status={conversation.status} />
                      ) : (
                        <span className="text-meta font-normal text-muted-foreground">
                          {formatRelative(conversation.last_activity_at)}
                        </span>
                      )}
                    </SidebarMenuButton>
                    <ItemMenu
                      name={conversation.title}
                      className={cn(ROW_MENU, DOTS_HOVER)}
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
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              title={name ? `Settings (${name})` : "Settings"}
              isActive={view.kind === "settings"}
              onClick={() => onNavigate({ kind: "settings" })}
            >
              {name ? (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-meta font-semibold text-foreground">
                  {initials(name)}
                </span>
              ) : (
                <SettingsIcon />
              )}
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

/** Where a row's "…" button sits and when it shows. It is beside the row's button, not in it. */
const ROW_MENU =
  "absolute top-1/2 right-1.5 -translate-y-1/2 opacity-0 group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 aria-expanded:opacity-100";

/** Keeps a row's hover while the pointer is on its "…" button or its menu is open. */
const ROW_HOVER =
  "group-hover/menu-item:bg-sidebar-accent group-has-aria-expanded/menu-item:bg-sidebar-accent";

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

/** The heading of the Project's group in the navigation: its name, or a dashed card when none is
 * open. Its menu switches to another Project. */
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
              "flex w-full cursor-pointer rounded-xl text-left outline-none",
              "focus-visible:outline-2 focus-visible:outline-ring",
              project
                ? "items-center gap-1 px-2.5 font-serif text-subheading text-foreground [&:hover_svg]:text-foreground"
                : "min-h-13.5 flex-col justify-center border border-dashed border-dash px-3 transition-colors duration-150 hover:bg-sidebar-accent",
            )}
          />
        }
      >
        {project ? (
          <>
            <span className="truncate">{project.name}</span>
            <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground transition-colors duration-150" />
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

/** A Conversation's title in the sidebar, with a dot when its reply ended while not open. */
function ConversationTitle({ title, unseen }: { title: string; unseen: boolean }) {
  return (
    <span className="flex w-full items-center gap-1.5 text-foreground">
      <span className="truncate">{title}</span>
      {unseen && (
        <span role="img" aria-label="New" className="size-1.5 shrink-0 rounded-full bg-primary" />
      )}
    </span>
  );
}
