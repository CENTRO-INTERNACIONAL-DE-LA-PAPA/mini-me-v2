import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api, errorMessage } from "../api";
import { ConversationStore } from "../protocol/eventStore";
import type { ProtocolEvent } from "../protocol/types";
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
    // Batches delivered before the opened state arrives wait for it; null once it has.
    let pending: ProtocolEvent[] | null = [];
    const opening = api.openConversation(projectId, conversationId, (events) => {
      if (!active) return;
      if (pending) pending.push(...events);
      else store.applyBatch(events);
    });
    opening
      .then((opened) => {
        if (!active) return;
        store.load(opened, pending ?? []);
        pending = null;
      })
      .catch((e) => active && setError(errorMessage(e)));
    return () => {
      active = false;
      // Waits for the open to finish, so that a Conversation closed while it opens is still
      // unsubscribed.
      opening
        .then((opened) => api.unsubscribeConversation(projectId, opened.subscription_id))
        .catch(() => {});
    };
  }, [store, projectId, conversationId]);

  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { state, error };
}

export function ChatView({ projectId, conversationId, onActivity }: Props) {
  const { state, error } = useConversation(projectId, conversationId);
  const bottom = useRef<HTMLDivElement>(null);
  // The message sent from this view, until Mini-Me decides who answers it. Kept in memory
  // only, so reopening a Conversation never shows a stale "Choosing" status.
  const [routing, setRouting] = useState<string | null>(null);
  const decided = routing !== null && state.messages.some((m) => m.reply_to === routing);
  const choosing = routing !== null && !decided;
  const replying = state.messages.some((m) => m.status === "streaming" || m.status === "paused");

  useEffect(() => {
    if (decided) {
      setRouting(null);
    }
  }, [decided]);

  // Follows new messages and the latest one as it streams, but not changes to earlier
  // messages, such as a reaction, which would pull the user away from what they read.
  const last = state.messages[state.messages.length - 1];
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [state.messages.length, last, choosing]);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-8 py-6">
          {state.messages.map((message) => (
            <MessageItem key={message.id} projectId={projectId} message={message} />
          ))}
          {choosing && (
            <p role="status" className="text-meta text-muted-foreground">
              Choosing a Mini-Me…
            </p>
          )}
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
        choosing={choosing}
        onSent={(message) => {
          setRouting(message.id);
          onActivity();
        }}
      />
    </section>
  );
}
