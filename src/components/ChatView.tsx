import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { ActivityIcon, ListTodoIcon } from "lucide-react";
import { api, errorMessage } from "../api";
import { ConversationStore } from "../protocol/eventStore";
import type { ProtocolEvent } from "../protocol/types";
import { Composer } from "./Composer";
import { MessageItem } from "./MessageItem";
import type { MessageView } from "../protocol/eventStore";
import { PLACEHOLDER_JOBS, PLACEHOLDER_TODOS } from "../placeholders";
import { MiniMeAvatar } from "./MiniMeAvatar";
import { JobsPanel, StepsPanel, TodoPanel, type Panel } from "./SidePanels";
import { useMiniMes } from "./useMiniMes";

interface Props {
  projectId: string;
  projectName: string;
  conversationId: string;
  title: string;
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

export function ChatView({ projectId, projectName, conversationId, title, onActivity }: Props) {
  const { state, error } = useConversation(projectId, conversationId);
  const [panel, setPanel] = useState<Panel | null>(null);
  const toggle = (next: Panel) =>
    setPanel((current) => (JSON.stringify(current) === JSON.stringify(next) ? null : next));
  // Stable, so toggling one reply's steps renders only the replies whose state changed.
  const toggleSteps = useCallback(
    (messageId: string) =>
      setPanel((current) =>
        current?.kind === "steps" && current.messageId === messageId
          ? null
          : { kind: "steps", messageId },
      ),
    [],
  );
  const stepsOf =
    panel?.kind === "steps" ? state.messages.find((m) => m.id === panel.messageId) : undefined;
  const openTodos = PLACEHOLDER_TODOS?.filter((t) => !t.done).length ?? 0;
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
    <div className="flex min-h-0 min-w-0 flex-1">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-border px-8 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-meta text-muted-foreground">{projectName} / Conversation</p>
            <h1 className="truncate text-header font-bold">{title}</h1>
          </div>
          <Participants messages={state.messages} />
          {PLACEHOLDER_TODOS && (
            <Button
              variant="outline"
              size="sm"
              aria-pressed={panel?.kind === "todo"}
              onClick={() => toggle({ kind: "todo" })}
            >
              <ListTodoIcon />
              To-do
              <span className="opacity-60">{openTodos}</span>
            </Button>
          )}
          {PLACEHOLDER_JOBS && (
            <Button
              variant="outline"
              size="sm"
              aria-pressed={panel?.kind === "jobs"}
              onClick={() => toggle({ kind: "jobs" })}
            >
              <ActivityIcon />
              Background jobs
            </Button>
          )}
        </header>
        <div className="relative min-h-0 flex-1 overflow-y-auto">
          {/* DESIGN.md's message-list fade: the list's top edge fades into the workspace. */}
          <div
            aria-hidden
            className="pointer-events-none sticky top-0 z-10 -mb-6 h-6 bg-linear-to-b from-background to-transparent"
          />
          <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-8 pt-6 pb-8">
            {state.messages.map((message) => (
              <MessageItem
                key={message.id}
                projectId={projectId}
                message={message}
                onToggleSteps={toggleSteps}
                stepsShown={stepsOf?.id === message.id}
              />
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
      {panel?.kind === "todo" && <TodoPanel onClose={() => setPanel(null)} />}
      {panel?.kind === "jobs" && <JobsPanel onClose={() => setPanel(null)} />}
      {stepsOf && <StepsPanel message={stepsOf} onClose={() => setPanel(null)} />}
    </div>
  );
}

/** The avatars of the Mini-Mes that have replied in the Conversation, in order of first reply. */
function Participants({ messages }: { messages: MessageView[] }) {
  const miniMes = useMiniMes();
  const ids = [...new Set(messages.filter((m) => m.author.kind === "mini_me").map((m) => m.author.id))];
  const shown = ids.map((id) => miniMes.find((m) => m.id === id)).filter((m) => m !== undefined);
  if (shown.length === 0) return null;
  return (
    <div className="flex shrink-0 items-center" title={shown.map((m) => m.name).join(", ")}>
      {shown.map((miniMe, index) => (
        <MiniMeAvatar
          key={miniMe.id}
          miniMe={miniMe}
          size={28}
          className={index > 0 ? "-ml-[7px]" : undefined}
        />
      ))}
    </div>
  );
}
