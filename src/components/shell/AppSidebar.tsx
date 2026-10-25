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
  SidebarGroupAction,
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
  BugIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  FolderIcon,
  HomeIcon,
  LayoutGridIcon,
  ChevronRightIcon,
  LeafIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react";
import { PLACEHOLDER_USER } from "../../placeholders";
import type { ConversationSummary, ProjectSummary } from "../../protocol/types";
import { formatRelative } from "../format";
import { MiniMeAvatar } from "../MiniMeAvatar";
import { SidecarStatusLine, useSidecarStatus } from "../SidecarStatusLine";
import { UpdateStatusLine } from "../UpdateStatusLine";
import { useMiniMes } from "../useMiniMes";
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
}: Props) {
  const sidecar = useSidecarStatus();

  return (
    <Sidebar>
      <SidebarHeader className="gap-3 px-3 pt-4">
        <div className="flex items-center justify-between pl-2.5">
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
      <SidebarContent className="px-1">
        {!project && (
          <SidebarGroup>
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
          <SidebarGroup>
            <SidebarMenu>
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
                <SidebarMenuBadge>{fileCount}</SidebarMenuBadge>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}
        {project && (
          <SidebarGroup>
            <SidebarGroupLabel>Conversations</SidebarGroupLabel>
            <SidebarGroupAction title="New conversation" onClick={onNewConversation}>
              <PlusIcon />
              <span className="sr-only">New conversation</span>
            </SidebarGroupAction>
            <SidebarMenu>
              {conversations.map((conversation) => {
                const active = view.kind === "conversation" && view.id === conversation.id;
                return (
                  <SidebarMenuItem key={conversation.id}>
                    <SidebarMenuButton
                      size="lg"
                      isActive={active}
                      className="flex-col items-start gap-0"
                      onClick={() => onNavigate({ kind: "conversation", id: conversation.id })}
                    >
                      <span className="w-full truncate">{conversation.title}</span>
                      <span
                        className={cn(
                          "text-meta",
                          active ? "text-muted-on-ink" : "text-muted-foreground",
                        )}
                      >
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
      <SidebarFooter className="gap-3 px-3 pb-3">
        <div className="grid gap-2 px-2.5">
          <SidecarStatusLine status={sidecar} />
          <UpdateStatusLine />
        </div>
        <SidebarMenu className="border-t border-sidebar-border pt-3">
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={["library", "mini-me", "trait"].includes(view.kind)}
              onClick={() => onNavigate({ kind: "library" })}
            >
              <AvatarStack />
              <span className="flex-1">Mini-Mes & Traits</span>
              <ChevronRightIcon className="text-muted-foreground group-data-active/menu-button:text-current" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex items-center gap-2.5 border-t border-sidebar-border pt-3 pl-2.5">
          {PLACEHOLDER_USER && (
            <>
              <span
                aria-hidden
                className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-card text-[10.5px] font-semibold"
              >
                {PLACEHOLDER_USER.initials}
              </span>
              <span className="grid min-w-0 leading-tight">
                <span className="truncate font-medium">{PLACEHOLDER_USER.name}</span>
                <span className="truncate text-meta text-muted-foreground">
                  {PLACEHOLDER_USER.detail}
                </span>
              </span>
            </>
          )}
          <span className="ml-auto flex gap-0.5">
            {import.meta.env.DEV && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="[DEBUG] Avatars"
                title="[DEBUG] Avatars"
                aria-pressed={view.kind === "avatars"}
                onClick={() => onNavigate({ kind: "avatars" })}
              >
                <BugIcon />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Settings"
              title="Settings"
              aria-pressed={view.kind === "settings"}
              onClick={() => onNavigate({ kind: "settings" })}
            >
              <SettingsIcon />
            </Button>
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

/** Mini-Mes the Library entry shows, one per group, overlapping by about a quarter. */
const STACKED = ["Researcher", "Curator", "Planner"];

function AvatarStack() {
  const miniMes = useMiniMes();
  const shown = STACKED.map((name) => miniMes.find((m) => m.name === name)).filter(
    (m) => m !== undefined,
  );
  return (
    // Menu buttons size every svg as an icon; avatar bodies are svgs that fill their box.
    <span className="flex shrink-0 [&_svg]:size-full!">
      {shown.map((m, i) => (
        <MiniMeAvatar key={m.id} miniMe={m} size={18} className={i > 0 ? "-ml-[5px]" : undefined} />
      ))}
    </span>
  );
}

/** The card at the top of the sidebar: the open Project, and a menu to switch to another. */
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
  const position = project ? projects.findIndex((p) => p.id === project.id) + 1 : 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className={cn(
              "flex w-full items-center gap-2.5 rounded-xl border bg-card px-2.5 py-2 text-left outline-none",
              "transition-colors duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
              project ? "border-border" : "border-dashed border-border-strong",
            )}
          />
        }
      >
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md",
            project ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground",
          )}
        >
          <LeafIcon className="size-3.5" />
        </span>
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className="truncate font-medium">{project?.name ?? "No project open"}</span>
          <span className="truncate text-meta text-muted-foreground">
            {project
              ? position > 0 && `Project ${position} of ${projects.length}`
              : "Choose one or start new"}
          </span>
        </span>
        <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
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
