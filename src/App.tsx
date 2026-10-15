import { useState } from "react";
import { ProjectPicker } from "./components/ProjectPicker";
import { ProjectView } from "./components/ProjectView";
import { SettingsView } from "./components/SettingsView";
import type { ProjectSummary } from "./protocol/types";

export default function App() {
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [settings, setSettings] = useState(false);

  if (settings) {
    return <SettingsView onClose={() => setSettings(false)} />;
  }
  return project ? (
    <ProjectView
      project={project}
      onClose={() => setProject(null)}
      onSettings={() => setSettings(true)}
    />
  ) : (
    <ProjectPicker onOpen={setProject} onSettings={() => setSettings(true)} />
  );
}
