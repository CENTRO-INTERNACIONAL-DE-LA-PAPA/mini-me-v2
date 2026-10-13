import { useState } from "react";
import { ProjectPicker } from "./components/ProjectPicker";
import { ProjectView } from "./components/ProjectView";
import type { ProjectSummary } from "./protocol/types";
import "./App.css";

export default function App() {
  const [project, setProject] = useState<ProjectSummary | null>(null);

  return project ? (
    <ProjectView project={project} onClose={() => setProject(null)} />
  ) : (
    <ProjectPicker onOpen={setProject} />
  );
}
