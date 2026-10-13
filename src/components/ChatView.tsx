import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api, errorMessage } from "../api";
import { ConversationStore } from "../protocol/eventStore";
import { Composer } from "./Composer";
import { MessageItem } from "./MessageItem";

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
    <section className="chat">
      <div className="messages">
        {state.messages.map((message) => (
          <MessageItem key={message.id} projectId={projectId} message={message} />
        ))}
        {state.messages.length === 0 && <p className="muted empty">No messages yet.</p>}
        <div ref={bottom} />
      </div>
      {error && <p className="error">{error}</p>}
      <Composer
        projectId={projectId}
        conversationId={conversationId}
        replying={replying}
        onSent={onActivity}
      />
    </section>
  );
}
