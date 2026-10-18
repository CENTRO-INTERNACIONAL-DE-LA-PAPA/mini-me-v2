import { useState } from "react";
import { AvatarDebugView } from "./components/avatar/AvatarDebugView";
import { ProjectPicker } from "./components/ProjectPicker";
import { ProjectView } from "./components/ProjectView";
import { SettingsView } from "./components/SettingsView";
import type { ProjectSummary } from "./protocol/types";

export default function App() {
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [settings, setSettings] = useState(false);
  const [avatarDebug, setAvatarDebug] = useState(false);

  if (avatarDebug) {
    return <AvatarDebugView onClose={() => setAvatarDebug(false)} />;
  }
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
    <ProjectPicker
      onOpen={setProject}
      onSettings={() => setSettings(true)}
      onAvatarDebug={() => setAvatarDebug(true)}
    />
  );
}
