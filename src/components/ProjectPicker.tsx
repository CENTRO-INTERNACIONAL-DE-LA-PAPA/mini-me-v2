import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../api";
import type { ProjectSummary } from "../protocol/types";

interface Props {
  onOpen: (project: ProjectSummary) => void;
}

export function ProjectPicker({ onOpen }: Props) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    <main className="picker">
      <h1>Mini-Me</h1>
      <form className="picker-create" onSubmit={create}>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          placeholder="New Project name"
          maxLength={200}
          autoFocus
        />
        <button type="submit">Create Project</button>
      </form>
      {error && <p className="error">{error}</p>}
      <ul className="picker-list">
        {projects.map((project) => (
          <li key={project.id}>
            <button onClick={() => open(project)}>{project.name}</button>
          </li>
        ))}
        {projects.length === 0 && <li className="muted">No Projects yet.</li>}
      </ul>
    </main>
  );
}
