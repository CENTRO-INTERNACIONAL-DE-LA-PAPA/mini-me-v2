import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { api, errorMessage } from "../../api";
import { ConversationStore } from "../../protocol/eventStore";
import type { ProtocolEvent } from "../../protocol/types";

/** A Conversation's messages, kept current as its events arrive, and why it could not be
 * opened. A comment thread is a Conversation too, so its card uses this as well. */
export function useConversation(projectId: string, conversationId: string) {
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
