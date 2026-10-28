import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { cn } from "@/lib/utils";
import { ActivityIcon, ListTreeIcon, PaperclipIcon } from "lucide-react";
import { api, errorMessage } from "../../api";
import { ConversationStore } from "../../protocol/eventStore";
import type { ProtocolEvent, Uuid } from "../../protocol/types";
import { chatColumn, Composer, type ComposerHandle } from "./Composer";
import { MessageItem } from "./MessageItem";
import type { MessageView } from "../../protocol/eventStore";
import { MiniMePill } from "../minime/MiniMePill";
import { MainSheet, SheetHeader, ToolSwitch, type ToolOption } from "../shell/Sheet";
import { FeaturingProvider } from "../interactive/featuring";
import { componentNames } from "../interactive/component-names";
import { ComponentReferencesProvider } from "../interactive/component-references";
import type { ReferenceTarget } from "../../protocol/references";
import { JobsPanel, OutlinePanel, StepsPanel, type Panel } from "./SidePanels";
import { outline } from "./outline";
import { useMiniMes } from "../../hooks/useMiniMes";
import { useRunningReplies } from "../../hooks/useRunningReplies";

interface Props {
  projectId: string;
  conversationId: string;
  title: string;
  /** A message to scroll to once the Conversation has loaded, instead of the latest one. */
  messageId?: string;
  onActivity: () => void;
  onOpenReply: (projectId: Uuid, conversationId: Uuid, messageId: Uuid) => void;
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

export function ChatView({
  projectId,
  conversationId,
  title,
  messageId,
  onActivity,
  onOpenReply,
}: Props) {
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
  const running = useRunningReplies();
  // The open Conversation's reply first, then the others in the order their runs started.
  const jobs = [
    ...running.filter((reply) => reply.conversation_id === conversationId),
    ...running.filter((reply) => reply.conversation_id !== conversationId),
  ];
  const tools: ToolOption<"outline" | "jobs">[] = [
    { id: "outline", label: "Outline", icon: ListTreeIcon },
    {
      id: "jobs",
      label: "Jobs",
      icon: ActivityIcon,
      count: jobs.length > 0 ? jobs.length : undefined,
    },
  ];
  const bottom = useRef<HTMLDivElement>(null);
  // The message sent from this view, until Mini-Me decides who answers it. Kept in memory
  // only, so reopening a Conversation never shows a stale "Choosing" status.
  const [routing, setRouting] = useState<string | null>(null);
  const decided = routing !== null && state.messages.some((m) => m.reply_to === routing);
  const choosing = routing !== null && !decided;
  const replying = state.messages.some((m) => m.status === "streaming" || m.status === "paused");
  const composer = useRef<ComposerHandle>(null);
  const names = useMemo(() => componentNames(state.messages), [state.messages]);
  const used = useMemo(() => outline(state.messages, names), [state.messages, names]);
  const newestFirst = useMemo(() => [...names.values()].reverse(), [names]);
  const appendReference = useCallback(
    (target: ReferenceTarget) => composer.current?.appendReference(target),
    [],
  );
  /** Files are being dragged over the window. */
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent(({ payload }) => {
        if (payload.type === "enter") {
          setDragging(payload.paths.length > 0);
        } else if (payload.type === "leave") {
          setDragging(false);
        } else if (payload.type === "drop") {
          setDragging(false);
          if (payload.paths.length > 0) composer.current?.attachDropped(payload.paths);
        }
      })
      .then((stop) => (active ? (unlisten = stop) : stop()));
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (decided) {
      setRouting(null);
    }
  }, [decided]);

  // Follows new messages and the latest one as it streams, but not changes to earlier
  // messages, such as a reaction, which would pull the user away from what they read.
  const last = state.messages[state.messages.length - 1];
  // The message the Conversation was opened at, until it has been scrolled to.
  const target = useRef(messageId);
  useEffect(() => {
    if (target.current && state.messages.length > 0) {
      const element = document.querySelector(`[data-message-id="${target.current}"]`);
      target.current = undefined;
      if (element) {
        element.scrollIntoView({ block: "center" });
        return;
      }
    } else if (target.current) {
      return;
    }
    bottom.current?.scrollIntoView({ block: "end" });
  }, [state.messages.length, last, choosing]);

  return (
    <FeaturingProvider projectId={projectId}>
      <ComponentReferencesProvider names={names} append={appendReference}>
        <div className="flex min-h-0 min-w-0 flex-1 gap-3">
          <MainSheet>
            {dragging && (
              <div
                role="status"
                className={cn(
                  "pointer-events-none absolute inset-3 z-30 flex flex-col items-center",
                  "justify-center gap-2 rounded-card border-2 border-dashed border-primary",
                  "bg-background/90 text-ui font-semibold",
                )}
              >
                <PaperclipIcon aria-hidden className="size-6" />
                Drop to attach
              </div>
            )}
            <SheetHeader
              title={title}
              compact={panel !== null}
              actions={
                <ToolSwitch
                  label="Tools"
                  options={tools}
                  value={panel?.kind === "steps" ? null : (panel?.kind ?? null)}
                  onToggle={(kind) => toggle({ kind })}
                />
              }
            >
              <Participants messages={state.messages} />
            </SheetHeader>
            {/* A gutter on both sides keeps the column centred like the composer whether or
                not a scrollbar shows. */}
            <div className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]">
              {/* The list's top edge fades into the sheet. */}
              <div
                aria-hidden
                className="pointer-events-none sticky top-0 z-10 -mb-14 h-14 bg-linear-to-b from-background to-transparent"
              />
              {/* The bottom padding lets the last reply clear the floating composer. */}
              <div
                className={cn(
                  "flex flex-col gap-[22px] pt-8 pb-[150px]",
                  chatColumn(panel !== null, "messages"),
                )}
              >
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
              ref={composer}
              narrow={panel !== null}
              components={newestFirst}
              projectId={projectId}
              conversationId={conversationId}
              replying={replying}
              choosing={choosing}
              onSent={(message) => {
                setRouting(message.id);
                onActivity();
              }}
            />
          </MainSheet>
          {panel?.kind === "outline" && (
            <OutlinePanel outline={used} onClose={() => setPanel(null)} />
          )}
          {panel?.kind === "jobs" && (
            <JobsPanel
              replies={jobs}
              conversationId={conversationId}
              onOpen={(reply) => {
                if (reply.conversation_id === conversationId) {
                  document
                    .querySelector(`[data-message-id="${reply.message_id}"]`)
                    ?.scrollIntoView({ block: "center", behavior: "smooth" });
                } else {
                  onOpenReply(reply.project_id, reply.conversation_id, reply.message_id);
                }
              }}
              onClose={() => setPanel(null)}
            />
          )}
          {stepsOf && <StepsPanel message={stepsOf} onClose={() => setPanel(null)} />}
        </div>
      </ComponentReferencesProvider>
    </FeaturingProvider>
  );
}

const TAG_STATUS: Record<string, string | undefined> = {
  streaming: "Replying",
  paused: "Waiting for you",
};

/** A name tag for each Mini-Me that has replied in the Conversation, in order of first reply,
 * with what its latest reply is doing while it runs. */
function Participants({ messages }: { messages: MessageView[] }) {
  const miniMes = useMiniMes();
  const replies = messages.filter((m) => m.author.kind === "mini_me");
  const ids = [...new Set(replies.map((m) => m.author.id))];
  const shown = ids.map((id) => miniMes.find((m) => m.id === id)).filter((m) => m !== undefined);
  if (shown.length === 0) return null;
  return (
    <ul aria-label="Mini-Mes in this conversation" className="flex flex-wrap gap-2">
      {shown.map((miniMe) => {
        const latest = [...replies].reverse().find((m) => m.author.id === miniMe.id);
        const status = latest && TAG_STATUS[latest.status];
        return (
          <li key={miniMe.id}>
            <MiniMePill miniMe={miniMe} size="tag">
              {miniMe.name}
              {status && <span className="font-normal opacity-80">· {status}</span>}
            </MiniMePill>
          </li>
        );
      })}
    </ul>
  );
}
