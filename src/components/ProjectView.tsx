import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import type { ConversationSummary, ProjectSummary } from "../protocol/types";
import { ChatView } from "./ChatView";

interface Props {
  project: ProjectSummary;
  onClose: () => void;
}

export function ProjectView({ project, onClose }: Props) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setConversations(await api.listConversations(project.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [project.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function create() {
    try {
      const conversation = await api.createConversation(project.id);
      await refresh();
      setSelected(conversation.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="project">
      <aside className="sidebar">
        <button className="link" onClick={onClose}>
          ← Projects
        </button>
        <h2>{project.name}</h2>
        <button onClick={create}>New conversation</button>
        {error && <p className="error">{error}</p>}
        <ul className="conversation-list">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <button
                className={conversation.id === selected ? "active" : undefined}
                onClick={() => setSelected(conversation.id)}
              >
                {conversation.title}
                <span className="muted">
                  {new Date(conversation.last_activity_at).toLocaleString()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      {selected ? (
        <ChatView
          key={selected}
          projectId={project.id}
          conversationId={selected}
          onActivity={refresh}
        />
      ) : (
        <section className="chat empty muted">Select or create a conversation.</section>
      )}
    </div>
  );
}
