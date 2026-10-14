import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import type { ConversationSummary, ProjectSummary } from "../protocol/types";
import { ChatView } from "./ChatView";
import { SidecarStatusLine, useSidecarStatus } from "./SidecarStatusLine";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  project: ProjectSummary;
  onClose: () => void;
}

export function ProjectView({ project, onClose }: Props) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sidecar = useSidecarStatus();

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
      <aside className="flex w-[264px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-border bg-sidebar px-3 py-4">
        <Button variant="link" className="justify-start text-muted-foreground" onClick={onClose}>
          ← Projects
        </Button>
        <h2 className="px-2.5 text-section font-bold">{project.name}</h2>
        <Button variant="outline" onClick={create}>
          New conversation
        </Button>
        {error && <p className="text-meta text-destructive">{error}</p>}
        <ul className="grid gap-0.5">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Button
                variant="ghost"
                aria-current={conversation.id === selected ? "page" : undefined}
                className={cn(
                  "group/item h-auto w-full flex-col items-start gap-0 rounded-md px-2.5 py-[7px] text-left font-normal whitespace-normal",
                  conversation.id === selected &&
                    "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                )}
                onClick={() => setSelected(conversation.id)}
              >
                {conversation.title}
                <span
                  className={cn(
                    "text-meta text-muted-foreground",
                    conversation.id === selected && "text-muted-on-ink",
                  )}
                >
                  {new Date(conversation.last_activity_at).toLocaleString()}
                </span>
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-3">
          <SidecarStatusLine status={sidecar} />
        </div>
      </aside>
      {selected ? (
        <ChatView
          key={selected}
          projectId={project.id}
          conversationId={selected}
          onActivity={refresh}
        />
      ) : (
        <section className="flex flex-1 items-center justify-center text-muted-foreground">
          Select or create a conversation.
        </section>
      )}
    </div>
  );
}
