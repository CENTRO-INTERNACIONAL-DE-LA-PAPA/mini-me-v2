import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api, errorMessage } from "../api";
import { ConversationStore } from "../protocol/eventStore";
import { Composer } from "./Composer";
import { MessageItem } from "./MessageItem";
import { Separator } from "@/components/ui/separator";

interface Props {
  projectId: string;
  conversationId: string;
  onActivity: () => void;
}

function useConversation(projectId: string, conversationId: string) {
  const store = useMemo(() => new ConversationStore(), [projectId, conversationId]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .subscribeConversation(projectId, conversationId, 0, (event) => {
        if (active) {
          store.apply(event);
        }
      })
      .catch((e) => setError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [store, projectId, conversationId]);

  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { state, error };
}

export function ChatView({ projectId, conversationId, onActivity }: Props) {
  const { state, error } = useConversation(projectId, conversationId);
  const bottom = useRef<HTMLDivElement>(null);
  const replying = state.messages.some((m) => m.status === "streaming");

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [state]);

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-8 py-6">
          {state.messages.map((message) => (
            <MessageItem key={message.id} projectId={projectId} message={message} />
          ))}
          {state.messages.length === 0 && (
            <p className="p-8 text-center text-muted-foreground">No messages yet.</p>
          )}
          <div ref={bottom} />
        </div>
      </div>
      {error && <p className="px-8 py-2 text-meta text-destructive">{error}</p>}
      <Separator />
      <Composer
        projectId={projectId}
        conversationId={conversationId}
        replying={replying}
        onSent={onActivity}
      />
    </section>
  );
}
