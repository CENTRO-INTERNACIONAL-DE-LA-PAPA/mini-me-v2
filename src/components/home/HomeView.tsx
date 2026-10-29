import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PlusIcon } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../../api";
import type { PausedApproval, ProjectSummary, Uuid } from "../../protocol/types";
import { formatRelative } from "../../lib/format";
import { MiniMeAvatar } from "../minime/MiniMeAvatar";
import { MiniMeSurface } from "../minime/MiniMeSurface";
import { SheetSection } from "../shell/Sheet";
import { useMiniMes } from "../../hooks/useMiniMes";
import { useUserProfile } from "../../hooks/useUserProfile";
import { firstName } from "../../lib/names";

interface Props {
  projects: ProjectSummary[];
  onOpen: (project: ProjectSummary) => void;
  onCreate: (name: string) => Promise<void>;
  onOpenReply: (projectId: Uuid, conversationId: Uuid, messageId: Uuid) => void;
}

function greeting(now: Date, name: string | null | undefined): string {
  const hour = now.getHours();
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const first = name ? firstName(name) : "";
  return first ? `Good ${part}, ${first}` : `Good ${part}`;
}

/** The screen shown when no Project is open: what waits on you, and the Projects to open or
 * create. */
export function HomeView({ projects, onOpen, onCreate, onOpenReply }: Props) {
  const name = useUserProfile()?.name;
  // The "New project" tile is showing its name field; the header button opens it too.
  const [creating, setCreating] = useState(false);
  return (
    <main className="flex w-full flex-col gap-10 px-14 py-12">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-greeting font-medium text-foreground">
            {greeting(new Date(), name)}
          </h1>
          <p className="text-body text-muted-foreground">
            Open a project to talk to its Mini-Mes.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon />
          New project
        </Button>
      </header>

      <NeedsYou onOpenReply={onOpenReply} />

      <SheetSection title="Projects">
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {projects.map((project) => (
            <li key={project.id}>
              <ProjectCard project={project} onOpen={() => onOpen(project)} />
            </li>
          ))}
          <li>
            <NewProjectCard
              editing={creating}
              onEditing={setCreating}
              onCreate={onCreate}
            />
          </li>
        </ul>
      </SheetSection>
    </main>
  );
}

function ProjectCard({ project, onOpen }: { project: ProjectSummary; onOpen: () => void }) {
  return (
    <Card
      render={<button type="button" onClick={onOpen} />}
      className="h-full w-full cursor-pointer justify-between gap-7 p-5 text-left transition-colors duration-150 ease-out hover:bg-well-hover focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span className="self-end text-meta text-muted-foreground">
        {formatRelative(project.created_at)}
      </span>
      <span className="font-serif text-card-title font-medium text-foreground">
        {project.name}
      </span>
    </Card>
  );
}

/** A dashed tile that turns into a name field for a new Project. */
function NewProjectCard({
  editing,
  onEditing,
  onCreate,
}: {
  editing: boolean;
  onEditing: (editing: boolean) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onCreate(name);
    setName("");
    onEditing(false);
  }

  const tile = "h-full min-h-[150px] rounded-card border-[1.5px] border-dashed border-dash";
  if (editing) {
    return (
      <form onSubmit={submit} className={`${tile} flex flex-col justify-center gap-2 p-4`}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name"
          maxLength={200}
          autoFocus
          onKeyDown={(e) => e.key === "Escape" && onEditing(false)}
        />
        <div className="flex justify-end gap-1.5">
          <Button type="button" variant="ghost" size="sm" onClick={() => onEditing(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!name.trim()}>
            Create
          </Button>
        </div>
      </form>
    );
  }
  return (
    <Button
      variant="ghost"
      onClick={() => onEditing(true)}
      className={`${tile} w-full gap-2 font-normal text-muted-foreground hover:bg-muted`}
    >
      <PlusIcon />
      New project
    </Button>
  );
}

/** Replies paused at an approval in any Project, each in the colour of the Mini-Me waiting
 * on the user. Fetched each time Home is shown. */
function NeedsYou({
  onOpenReply,
}: {
  onOpenReply: (projectId: Uuid, conversationId: Uuid, messageId: Uuid) => void;
}) {
  const miniMes = useMiniMes();
  const [approvals, setApprovals] = useState<PausedApproval[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .listPausedApprovals()
      .then((list) => active && setApprovals(list))
      .catch((e) => active && setError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, []);

  return (
    <SheetSection title="Waiting on you">
      {error ? (
        <p className="text-meta text-destructive">{error}</p>
      ) : approvals?.length === 0 ? (
        <p className="text-body text-muted-foreground">Nothing is waiting on you.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
          {approvals?.map((approval) => {
            const miniMe = miniMes.find((m) => m.id === approval.mini_me.id);
            return (
              <MiniMeSurface
                key={approval.message_id}
                miniMe={miniMe}
                render={<li />}
                className="flex items-center gap-3.5 px-[18px] py-4"
              >
                <MiniMeAvatar miniMe={miniMe} size={40} />
                <div className="grid min-w-0 flex-1 gap-[3px]">
                  <span className="text-body font-medium text-foreground">{approval.prompt}</span>
                  <span className="truncate text-meta text-mm-ink">
                    {approval.mini_me.name} · {approval.project_name} ·{" "}
                    {approval.conversation_title}
                  </span>
                </div>
                <Button
                  variant="mini-me"
                  size="sm"
                  onClick={() =>
                    onOpenReply(
                      approval.project_id,
                      approval.conversation_id,
                      approval.message_id,
                    )
                  }
                >
                  Review
                </Button>
              </MiniMeSurface>
            );
          })}
        </ul>
      )}
    </SheetSection>
  );
}
