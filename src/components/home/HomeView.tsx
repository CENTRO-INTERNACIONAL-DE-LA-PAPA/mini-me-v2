import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PlusIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { PLACEHOLDER_NEEDS_YOU, PLACEHOLDER_USER } from "../../placeholders";
import type { ProjectSummary } from "../../protocol/types";
import { formatRelative } from "../../lib/format";
import { MiniMeAvatar } from "../minime/MiniMeAvatar";
import { MiniMeSurface } from "../minime/MiniMeSurface";
import { SampleTag } from "../minime/SampleTag";
import { SheetSection } from "../shell/Sheet";
import { useMiniMes } from "../../hooks/useMiniMes";

interface Props {
  projects: ProjectSummary[];
  onOpen: (project: ProjectSummary) => void;
  onCreate: (name: string) => Promise<void>;
}

function greeting(now: Date): string {
  const hour = now.getHours();
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return PLACEHOLDER_USER ? `Good ${part}, ${PLACEHOLDER_USER.firstName}` : `Good ${part}`;
}

/** The screen shown when no Project is open: what waits on you, and the Projects to open or
 * create. */
export function HomeView({ projects, onOpen, onCreate }: Props) {
  // The "New project" tile is showing its name field; the header button opens it too.
  const [creating, setCreating] = useState(false);
  return (
    <main className="flex w-full flex-col gap-10 px-14 py-12">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-greeting font-medium text-foreground">
            {greeting(new Date())}
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

      <NeedsYou />

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
      className="h-full w-full cursor-pointer justify-between gap-7 p-5 text-left transition-colors duration-150 ease-out hover:border-border-strong focus-visible:outline-2 focus-visible:outline-ring"
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

/** Things Mini-Mes handed back, each in the colour of the Mini-Me waiting on it. */
function NeedsYou() {
  const miniMes = useMiniMes();
  if (!PLACEHOLDER_NEEDS_YOU) return null;
  return (
    <SheetSection title="Waiting on you" meta={<SampleTag />}>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
        {PLACEHOLDER_NEEDS_YOU.map((task) => {
          const miniMe = miniMes.find((m) => m.name === task.miniMe);
          return (
            <MiniMeSurface
              key={task.title}
              miniMe={miniMe}
              render={<li />}
              className="flex items-center gap-3.5 px-[18px] py-4"
            >
              <MiniMeAvatar miniMe={miniMe} size={40} />
              <div className="grid min-w-0 flex-1 gap-[3px]">
                <span className="text-body font-medium text-foreground">{task.title}</span>
                <span className="truncate text-meta text-mm-ink">
                  {task.miniMe} · {task.project}
                </span>
              </div>
              <Button variant="mini-me" size="sm" disabled>
                {task.action}
              </Button>
            </MiniMeSurface>
          );
        })}
      </ul>
    </SheetSection>
  );
}
