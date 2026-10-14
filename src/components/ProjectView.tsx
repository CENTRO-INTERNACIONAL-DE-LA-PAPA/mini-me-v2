import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import type { ConversationSummary, ProjectSummary } from "../protocol/types";
import { ChatView } from "./ChatView";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

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
    <div className="flex h-screen">
      <aside className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto bg-card p-4">
        <Button variant="link" className="h-auto justify-start p-0 text-muted-foreground" onClick={onClose}>
          ← Projects
        </Button>
        <h2 className="text-lg font-semibold">{project.name}</h2>
        <Button variant="outline" onClick={create}>
          New conversation
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <ul className="grid gap-1">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Button
                variant="ghost"
                className={cn(
                  "h-auto w-full flex-col items-start gap-0 py-1.5 whitespace-normal",
                  conversation.id === selected && "bg-accent text-accent-foreground",
                )}
                onClick={() => setSelected(conversation.id)}
              >
                {conversation.title}
                <span className="text-xs font-normal text-muted-foreground">
                  {new Date(conversation.last_activity_at).toLocaleString()}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      </aside>
      <Separator orientation="vertical" />
      {selected ? (
        <ChatView
          key={selected}
          projectId={project.id}
          conversationId={selected}
          onActivity={refresh}
        />
      ) : (
        <section className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Select or create a conversation.
        </section>
      )}
    </div>
  );
}
