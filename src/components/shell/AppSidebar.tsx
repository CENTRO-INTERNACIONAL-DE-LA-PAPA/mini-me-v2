import { Hint } from "./Hint";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  MessageCircleIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react";
import type { ConversationSummary, ProjectSummary, Uuid } from "../../protocol/types";
import { MiniMeAvatar } from "../minime/MiniMeAvatar";
import { ConversationStatusMark } from "./ConversationStatusMark";
import { RoutingWarningLine } from "./RoutingWarningLine";
import { SidecarStatusLine, sidecarReady, useSidecarStatus } from "./SidecarStatusLine";
import { ConversationMenu, DOTS_HOVER } from "./ItemMenu";
import { UpdateStatusLine } from "./UpdateStatusLine";
import { useMiniMes } from "../../hooks/useMiniMes";
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
  onRenameConversation,
  onDeleteConversation,
}: Props) {
  const sidecar = useSidecarStatus();
  // The navigation sheet shrinks to a rail of icons when a tool sheet opens in a small window.
  const collapsed = useSidebar().state === "collapsed";

  return (
    <Sidebar variant="floating" collapsible="icon">
      <SidebarHeader className="gap-5.5 px-3.5 pt-5 pb-0">
        <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between px-2")}>
          {!collapsed && (
            <Hint label="Home">
              <button
                type="button"
                aria-label="Home"
                onClick={() => onNavigate({ kind: "home" })}
                className="cursor-pointer rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-ring"
              >
                <Wordmark height={16} />
              </button>
            </Hint>
          )}
          <Hint label={collapsed ? "Show navigation" : undefined} side="right">
            <SidebarTrigger />
          </Hint>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-5.5 px-1.5 pt-5.5">
        <SidebarGroup className="py-0">
          <SidebarMenu className="gap-0.5">
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Home"
                isActive={view.kind === "home"}
                onClick={() => onNavigate({ kind: "home" })}
              >
                <HomeIcon />
                <span>Home</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Mini-Mes"
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
            />
          )}
          {project && (
            <SidebarMenu className="gap-0.5">
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Overview"
                  isActive={view.kind === "overview"}
                  onClick={() => onNavigate({ kind: "overview" })}
                >
                  <CompassIcon />
                  <span>Overview</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Files"
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
                  "h-auto p-0 text-ui font-medium text-foreground",
                  collapsed && "hidden",
                )}
              >
                Conversations
              </SidebarGroupLabel>
              <Hint label="New conversation" side={collapsed ? "right" : undefined}>
                <Button
                  variant={collapsed ? "default" : "ghost"}
                  size="icon-sm"
                  aria-label="New conversation"
                  onClick={onNewConversation}
                >
                  <PlusIcon />
                </Button>
              </Hint>
            </div>
            <SidebarMenu className={cn("gap-0.5", collapsed && "hidden")}>
              {conversations.map((conversation) => {
                const active = view.kind === "conversation" && view.id === conversation.id;
                return (
                  <SidebarMenuItem key={conversation.id}>
                    <SidebarMenuButton
                      isActive={active}
                      className={cn("pr-9", !active && ROW_HOVER)}
                      onClick={() => onNavigate({ kind: "conversation", id: conversation.id })}
                    >
                      <MessageCircleIcon className="text-muted-foreground" />
                      <ConversationTitle
                        title={conversation.title}
                        unseen={unseen.has(conversation.id)}
                      />
                    </SidebarMenuButton>
                    {conversation.status && (
                      <SidebarMenuBadge className={HIDE_ON_ROW_HOVER}>
                        <ConversationStatusMark status={conversation.status} />
                      </SidebarMenuBadge>
                    )}
                    <ConversationMenu
                      name={conversation.title}
                      className={cn(ROW_MENU, DOTS_HOVER)}
                      onRename={(title) => onRenameConversation(conversation.id, title)}
                      onDelete={() => onDeleteConversation(conversation.id)}
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
              tooltip="Settings"
              isActive={view.kind === "settings"}
              onClick={() => onNavigate({ kind: "settings" })}
            >
              <SettingsIcon />
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

const HIDE_ON_ROW_HOVER =
  "group-focus-within/menu-item:opacity-0 group-hover/menu-item:opacity-0 group-has-aria-expanded/menu-item:opacity-0";

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
        <MiniMeAvatar key={m.id} miniMe={m} size={22} className={i > 0 ? "-ml-1.5" : undefined} />
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
}: {
  project: ProjectSummary | null;
  projects: ProjectSummary[];
  onOpen: (project: ProjectSummary) => void;
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A Conversation's title in the sidebar, with a dot when its reply ended while not open. */
function ConversationTitle({ title, unseen }: { title: string; unseen: boolean }) {
  return (
    <span className="flex w-full items-center gap-2 text-foreground">
      <span className="truncate">{title}</span>
      {unseen && (
        <span role="img" aria-label="New" className="size-1.5 shrink-0 rounded-full bg-primary" />
      )}
    </span>
  );
}
