import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../api";
import type { ProjectSummary } from "../protocol/types";
import { SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidecarStatusLine, useSidecarStatus } from "./SidecarStatusLine";
import { UpdateStatusLine } from "./UpdateStatusLine";

interface Props {
  onOpen: (project: ProjectSummary) => void;
  onSettings: () => void;
}

export function ProjectPicker({ onOpen, onSettings }: Props) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const sidecar = useSidecarStatus();

  useEffect(() => {
    api.listProjects().then(setProjects).catch((e) => setError(errorMessage(e)));
  }, []);

  async function open(project: ProjectSummary) {
    try {
      onOpen(await api.openProject(project.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      const project = await api.createProject(name);
      setName("");
      await open(project);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <main className="mx-auto mt-[10vh] max-w-lg px-4">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-page font-bold">Mini-Me</h1>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Settings"
          title="Settings"
          onClick={onSettings}
        >
          <SettingsIcon />
        </Button>
      </header>
      <form className="flex gap-2" onSubmit={create}>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          placeholder="New Project name"
          maxLength={200}
          autoFocus
        />
        <Button type="submit">Create Project</Button>
      </form>
      {error && <p className="my-2 text-meta text-destructive">{error}</p>}
      <ul className="mt-6 grid gap-1.5">
        {projects.map((project) => (
          <li key={project.id}>
            <Button variant="outline" className="w-full justify-start" onClick={() => open(project)}>
              {project.name}
            </Button>
          </li>
        ))}
        {projects.length === 0 && <li className="text-muted-foreground">No Projects yet.</li>}
      </ul>
      <div className="mt-8 grid gap-2">
        <SidecarStatusLine status={sidecar} />
        <UpdateStatusLine />
      </div>
    </main>
  );
}
