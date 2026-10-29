import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "../../api";
import { useMiniMes } from "../../hooks/useMiniMes";
import { formatClock } from "../../lib/format";
import type { CommentThread, Component, Message, Uuid } from "../../protocol/types";
import { Composer } from "../chat/Composer";
import { MessageItem } from "../chat/MessageItem";
import { useConversation } from "../chat/useConversation";
import { componentNames } from "../interactive/component-names";
import { ThreadSuggestionsProvider } from "../interactive/suggestion";
import { DeleteButton } from "../library/LibraryParts";
import { ToolSheet } from "../shell/Sheet";
import type { Placement } from "./anchors";
import { passageLocation } from "./location";

type Tab = "open" | "resolved";

interface Props {
  projectId: Uuid;
  /** The document's source, which says where each passage sits. */
  text: string;
  threads: CommentThread[];
  placements: ReadonlyMap<Uuid, Placement>;
  /** The thread shown in full; null shows the list. */
  open: Uuid | null;
  onOpen: (id: Uuid | null) => void;
  onClose: () => void;
  /** Called when a comment or reply is added, so the list can update. */
  onActivity: () => void;
  onResolve: (id: Uuid, resolved: boolean) => void;
  onDelete: (id: Uuid) => void;
  /** Accepts a thread's suggestion into the document and resolves the thread; rejects with
   * why it could not. */
  onAccept: (id: Uuid, messageId: Uuid, componentId: Uuid) => Promise<void>;
  onOpenConversation: (id: Uuid) => void;
}

/** The document's comment threads beside it, as a tool sheet: a list under Open and Resolved
 * tabs, or one thread in full. */
export function CommentsSheet({
  projectId,
  text,
  threads,
  placements,
  open,
  onOpen,
  onClose,
  onActivity,
  onResolve,
  onDelete,
  onAccept,
  onOpenConversation,
}: Props) {
  const [tab, setTab] = useState<Tab>("open");
  const lists: Record<Tab, CommentThread[]> = {
    open: threadsInOrder(threads, placements, false),
    resolved: threadsInOrder(threads, placements, true),
  };
  const from = (thread: CommentThread) => placements.get(thread.conversation_id)?.from;
  const location = (thread: CommentThread) => {
    const at = from(thread);
    return at === undefined ? null : passageLocation(text, at);
  };
  const meta = `${lists.open.length} open · ${lists.resolved.length} resolved`;

  const thread = threads.find((t) => t.conversation_id === open);
  if (thread) {
    const list = lists[thread.resolved ? "resolved" : "open"];
    const index = list.indexOf(thread);
    return (
      <ToolSheet title="Comments" meta={meta} onClose={onClose}>
        <ThreadView
          key={thread.conversation_id}
          projectId={projectId}
          thread={thread}
          number={index + 1}
          location={location(thread)}
          detached={from(thread) === undefined}
          position={`${index + 1} of ${list.length} ${thread.resolved ? "resolved" : "open"}`}
          onBack={() => onOpen(null)}
          onPrevious={index > 0 ? () => onOpen(list[index - 1].conversation_id) : undefined}
          onNext={
            index < list.length - 1 ? () => onOpen(list[index + 1].conversation_id) : undefined
          }
          onActivity={onActivity}
          onResolve={(resolved) => onResolve(thread.conversation_id, resolved)}
          onDelete={() => onDelete(thread.conversation_id)}
          onAccept={(messageId, componentId) =>
            onAccept(thread.conversation_id, messageId, componentId)
          }
          onOpenConversation={onOpenConversation}
        />
      </ToolSheet>
    );
  }

  const shown = lists[tab];
  const detachedFrom = shown.findIndex((t) => from(t) === undefined);
  return (
    <ToolSheet title="Comments" meta={meta} onClose={onClose}>
      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="mb-4">
        <TabsList aria-label="Comments">
          <TabsTrigger value="open">
            Open <span className="tabular-nums">{lists.open.length}</span>
          </TabsTrigger>
          <TabsTrigger value="resolved">
            Resolved <span className="tabular-nums">{lists.resolved.length}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {shown.length === 0 && (
        <p className="text-body text-muted-foreground">
          {tab === "open"
            ? "Select text in the source and click the comment button to start a thread."
            : "Resolved threads appear here."}
        </p>
      )}
      {/* `grid-cols-1` lets rows shrink below their content, so long passages truncate. */}
      <ul className="grid grid-cols-1">
        {shown.map((t, index) => (
          <li key={t.conversation_id} className="min-w-0">
            {index === detachedFrom && (
              <h3 className="mt-6 mb-2.5 font-serif text-subheading text-foreground">Detached</h3>
            )}
            <button
              type="button"
              onClick={() => onOpen(t.conversation_id)}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                "duration-150 ease-out hover:bg-muted focus-visible:outline-2",
                "focus-visible:outline-ring",
              )}
            >
              <NumberBadge number={index + 1} />
              <span className="grid min-w-0 flex-1 gap-0.5">
                {location(t) && (
                  <span className="truncate text-meta text-muted-foreground">{location(t)}</span>
                )}
                <span className="truncate">“{t.quote}”</span>
              </span>
              <span className="shrink-0 text-meta text-muted-foreground tabular-nums">
                {formatClock(t.created_at)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </ToolSheet>
  );
}

/** The threads that are `resolved` or not, in the order of their passages in the source, with
 * the detached ones last. Their positions are the numbers the source shows by each passage. */
export function threadsInOrder(
  threads: CommentThread[],
  placements: ReadonlyMap<Uuid, Placement>,
  resolved: boolean,
): CommentThread[] {
  const from = (thread: CommentThread) => placements.get(thread.conversation_id)?.from;
  const listed = threads.filter((t) => t.resolved === resolved);
  const placed = listed.filter((t) => from(t) !== undefined).sort((a, b) => from(a)! - from(b)!);
  return [...placed, ...listed.filter((t) => from(t) === undefined)];
}

/** A thread's number in the document, as the source shows it by its passage. */
function NumberBadge({ number }: { number: number }) {
  return (
    <span
      className={cn(
        "mt-px grid size-5 shrink-0 place-items-center rounded-[5px] border border-foreground",
        "text-meta leading-none font-semibold text-foreground tabular-nums",
      )}
    >
      {number}
    </span>
  );
}

/** One thread in full: where it is, its messages with any suggestions, and a field to reply,
 * with ways to move to the previous or next thread and back to the list. */
function ThreadView({
  projectId,
  thread,
  number,
  location,
  detached,
  position,
  onBack,
  onPrevious,
  onNext,
  onActivity,
  onResolve,
  onDelete,
  onAccept,
  onOpenConversation,
}: {
  projectId: Uuid;
  thread: CommentThread;
  number: number;
  location: string | null;
  detached: boolean;
  position: string;
  onBack: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onActivity: () => void;
  onResolve: (resolved: boolean) => void;
  onDelete: () => void;
  onAccept: (messageId: Uuid, componentId: Uuid) => Promise<void>;
  onOpenConversation: (id: Uuid) => void;
}) {
  const { state, error } = useConversation(projectId, thread.conversation_id);
  const names = useMemo(() => componentNames(state.messages), [state.messages]);
  const newestFirst = useMemo(() => [...names.values()].reverse(), [names]);
  const replying = state.messages.some((m) => m.status === "streaming" || m.status === "paused");
  const [failure, setFailure] = useState<string | null>(null);
  const miniMes = useMiniMes();
  const from = thread.opened_from;
  const opener = from ? (miniMes.find((m) => m.id === from.by.id)?.name ?? "a Mini-Me") : "you";
  const pending = newestPending(state.messages);

  // The list's counts and the source's suggestion marks follow new messages, finished replies,
  // and suggestions as they arrive and are answered.
  const activity = useRef(onActivity);
  activity.current = onActivity;
  const changes = state.messages
    .map((m) => m.status + m.components.map((c) => (c.answer == null ? "?" : "!")).join(""))
    .join();
  useEffect(() => {
    if (state.messages.length > 0) activity.current();
  }, [changes]);

  /** Resolves the thread, dismissing a suggestion still waiting in it. */
  async function resolve() {
    try {
      if (pending) {
        const { message, component } = pending;
        await api.answerSuggestion(projectId, message.id, component.id, "dismissed");
      }
      onResolve(true);
    } catch (e) {
      setFailure(errorMessage(e));
    }
  }

  // `grid-cols-1` keeps the columns at the sheet's width, so a long passage truncates instead
  // of widening the sheet.
  return (
    <div className="grid grid-cols-1 gap-4">
      <nav className="-mx-2 flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeftIcon />
          All comments
        </Button>
        <span className="ml-auto text-meta text-muted-foreground">{position}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous thread"
          disabled={!onPrevious}
          onClick={onPrevious}
        >
          <ChevronUpIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next thread"
          disabled={!onNext}
          onClick={onNext}
        >
          <ChevronDownIcon />
        </Button>
      </nav>
      <div className="grid grid-cols-1 gap-1.5">
        <h3 className="flex items-center gap-2 font-serif text-subheading text-foreground">
          <NumberBadge number={number} />
          <span className="min-w-0 truncate">{location ?? `“${thread.quote}”`}</span>
        </h3>
        <div className="flex items-center gap-2 text-meta text-muted-foreground">
          <span className="flex-1">
            Opened by {opener}
            {from?.title && (
              <>
                {" · from "}
                <Button
                  variant="link"
                  className="text-meta"
                  onClick={() => onOpenConversation(from.conversation_id)}
                >
                  {from.title}
                </Button>
              </>
            )}
            {` · ${formatClock(thread.created_at)}`}
            {detached && " · passage not found"}
          </span>
          {thread.resolved ? (
            <Button variant="mini-me" onClick={() => onResolve(false)}>
              <RotateCcwIcon />
              Reopen
            </Button>
          ) : (
            !detached &&
            state.messages.length > 0 && (
              <Button variant="mini-me" onClick={() => void resolve()}>
                <CheckIcon />
                Resolve
              </Button>
            )
          )}
          <DeleteButton
            question={`Delete this thread and its ${thread.comments} comment${
              thread.comments === 1 ? "" : "s"
            }?`}
            onDelete={onDelete}
            variant="mini-me"
          />
        </div>
      </div>
      {state.messages.length > 0 && (
        <ThreadSuggestionsProvider value={{ accept: onAccept, detached }}>
          <div className="grid grid-cols-1 gap-3">
            {state.messages.map((message) => (
              <MessageItem key={message.id} projectId={projectId} message={message} compact />
            ))}
          </div>
        </ThreadSuggestionsProvider>
      )}
      {(error || failure) && <p className="text-meta text-destructive">{error ?? failure}</p>}
      {!detached && !thread.resolved && (
        <div className="sticky bottom-0 bg-background pt-1">
          <Composer
            projectId={projectId}
            conversationId={thread.conversation_id}
            replying={replying}
            choosing={false}
            components={newestFirst}
            onSent={() => {}}
            thread
          />
        </div>
      )}
    </div>
  );
}

/** The newest suggestion in `messages` still waiting for an answer, with its message. */
function newestPending(messages: Message[]) {
  let newest: { message: Message; component: Component } | undefined;
  for (const message of messages) {
    for (const component of message.components) {
      if (component.kind === "suggestion" && component.answer == null) {
        newest = { message, component };
      }
    }
  }
  return newest;
}
