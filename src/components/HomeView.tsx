import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { PLACEHOLDER_NEEDS_YOU, PLACEHOLDER_USER } from "../placeholders";
import type { ProjectSummary } from "../protocol/types";
import { formatRelative } from "./format";
import { MiniMePill } from "./MiniMePill";
import { useMiniMes } from "./useMiniMes";

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

/** The screen shown when no Project is open: the Projects to open or create. */
export function HomeView({ projects, onOpen, onCreate }: Props) {
  const now = new Date();
  return (
    <div className="mx-auto w-full max-w-[820px] px-8 pt-16 pb-16">
      <p className="text-meta text-muted-foreground">
        {now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
      </p>
      <h1 className="mt-1.5 text-display font-bold">{greeting(now)}</h1>

      <Section title="Projects" meta="Open a project to start a conversation">
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {projects.map((project) => (
            <li key={project.id}>
              <ProjectCard project={project} onOpen={() => onOpen(project)} />
            </li>
          ))}
          <li>
            <NewProjectCard onCreate={onCreate} />
          </li>
        </ul>
      </Section>

      <NeedsYou />
    </div>
  );
}

function Section({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-10">
      <header className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-section font-bold">{title}</h2>
        {meta && <span className="text-meta text-muted-foreground">{meta}</span>}
      </header>
      {children}
    </section>
  );
}

function ProjectCard({ project, onOpen }: { project: ProjectSummary; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group/project block h-full w-full text-left">
      <Card
        size="sm"
        className="h-full gap-0 py-0 transition-colors duration-150 group-hover/project:border-border-strong"
      >
        <span className="block flex-1 px-4 pt-4 pb-6 text-body font-semibold">
          {project.name}
        </span>
        <span className="flex items-center justify-between border-t border-border px-4 py-2.5 text-meta text-muted-foreground">
          Created {formatRelative(project.created_at)}
          <ChevronRightIcon className="size-4" />
        </span>
      </Card>
    </button>
  );
}

/** A dashed card that turns into a name field for a new Project. */
function NewProjectCard({ onCreate }: { onCreate: (name: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onCreate(name);
    setName("");
    setEditing(false);
  }

  if (editing) {
    return (
      <form
        onSubmit={submit}
        className="flex h-full flex-col justify-center gap-2 rounded-xl border border-dashed border-border-strong p-4"
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name"
          maxLength={200}
          autoFocus
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
        />
        <div className="flex justify-end gap-1.5">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
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
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="flex h-full min-h-[120px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong font-medium transition-colors duration-150 hover:bg-card"
    >
      <span className="flex size-8 items-center justify-center rounded-lg border border-border bg-card">
        <PlusIcon className="size-4" />
      </span>
      New project
    </button>
  );
}

function NeedsYou() {
  const miniMes = useMiniMes();
  if (!PLACEHOLDER_NEEDS_YOU) return null;
  return (
    <Section title="Needs you" meta={<SampleTag />}>
      <ul className="divide-y divide-border">
        {PLACEHOLDER_NEEDS_YOU.map((task) => (
          <li key={task.title} className="flex items-center gap-4 py-3">
            <div className="grid flex-1 gap-1">
              <span className="text-body">{task.title}</span>
              <span className="flex items-center gap-2 text-meta text-muted-foreground">
                <MiniMePill miniMe={miniMes.find((m) => m.name === task.miniMe)}>
                  {task.miniMe}
                </MiniMePill>
                {task.project}
              </span>
            </div>
            <Button variant="outline" size="sm" disabled>
              {task.action}
            </Button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Marks a section that shows sample data from `placeholders.ts`, in development builds. */
export function SampleTag() {
  return (
    <span className="rounded-full border border-dashed border-border-strong px-2 py-px text-meta text-muted-foreground">
      Sample data
    </span>
  );
}
