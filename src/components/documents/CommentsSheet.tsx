import { ListRow } from "../shell/ListRow";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, ChevronLeftIcon, ChevronUpIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { count, formatClock } from "../../lib/format";
import type { CommentThread, Uuid } from "../../protocol/types";
import { Composer } from "../chat/Composer";
import { MessageItem } from "../chat/MessageItem";
import { useConversation } from "../chat/useConversation";
import { ItemMenu } from "../shell/ItemMenu";
import { ToolSheet, ToolSheetHeading } from "../shell/Sheet";
import type { Placement } from "./anchors";
import { passageLocation } from "./location";
import { ErrorText } from "../shell/ErrorText";

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

  const thread = threads.find((t) => t.conversation_id === open);
  if (thread) {
    const list = lists[thread.resolved ? "resolved" : "open"];
    const index = list.indexOf(thread);
    return (
      <ToolSheet title="Comments" onClose={onClose}>
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
        />
      </ToolSheet>
    );
  }

  const shown = lists[tab];
  const detachedFrom = shown.findIndex((t) => from(t) === undefined);
  return (
    <ToolSheet title="Comments" onClose={onClose}>
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
        <Empty>
          <EmptyDescription>
            {tab === "open"
              ? "Select text in the source and click the comment button to start a thread."
              : "Resolved threads appear here."}
          </EmptyDescription>
        </Empty>
      )}
      {/* `grid-cols-1` lets rows shrink below their content, so long passages truncate. */}
      <ul className="grid grid-cols-1">
        {shown.map((t, index) => (
          <li key={t.conversation_id} className="min-w-0">
            {index === detachedFrom && (
              <div className="mt-6">
                <ToolSheetHeading>Detached</ToolSheetHeading>
              </div>
            )}
            <ListRow
              leading={<NumberBadge number={index + 1} />}
              name={`“${t.quote}”`}
              meta={location(t)}
              trailing={
                <span className="shrink-0 text-meta text-muted-foreground tabular-nums">
                  {formatClock(t.created_at)}
                </span>
              }
              onOpen={() => onOpen(t.conversation_id)}
            />
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
        "mt-px grid size-5 shrink-0 place-items-center rounded-sm border border-foreground",
        "text-meta leading-none font-semibold text-foreground tabular-nums",
      )}
    >
      {number}
    </span>
  );
}

/** One thread in full: where it is, its messages, a reply field and navigation. */
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
}) {
  const { state, error } = useConversation(projectId, thread.conversation_id);
  const replying = state.messages.some((m) => m.status === "streaming" || m.status === "paused");

  // The list's counts and the source's suggestions follow new messages and finished replies.
  const activity = useRef(onActivity);
  activity.current = onActivity;
  const changes = state.messages.map((m) => m.status).join();
  useEffect(() => {
    if (state.messages.length > 0) activity.current();
  }, [changes]);

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
      <div className="grid grid-cols-1 gap-1 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <h3 className="flex min-w-0 flex-1 items-center gap-2 font-serif text-subheading text-foreground">
            <NumberBadge number={number} />
            <span className="min-w-0 truncate">{location ?? `“${thread.quote}”`}</span>
          </h3>
          <ItemMenu
            name="this thread"
            actions={
              thread.resolved
                ? [{ label: "Reopen", onSelect: () => onResolve(false) }]
                : !detached && state.messages.length > 0
                  ? [{ label: "Resolve", onSelect: () => onResolve(true) }]
                  : []
            }
            remove={{
              question: `Delete this thread and its ${count(thread.comments, "comment")}?`,
              onDelete: async () => onDelete(),
            }}
          />
        </div>
        {/* Without a location, the title is already the passage. */}
        {location && (
          <p className="line-clamp-2 text-ui text-muted-foreground wrap-anywhere">
            “{thread.quote}”
          </p>
        )}
        {detached && <p className="text-meta text-muted-foreground">Passage not found</p>}
      </div>
      {state.messages.length > 0 && (
        <div className="grid grid-cols-1 gap-3">
          {state.messages.map((message) => (
            <MessageItem key={message.id} projectId={projectId} message={message} compact />
          ))}
        </div>
      )}
      {error && <ErrorText>{error}</ErrorText>}
      {!detached && !thread.resolved && (
        <div className="sticky bottom-0 bg-background pt-1">
          <Composer
            projectId={projectId}
            conversationId={thread.conversation_id}
            replying={replying}
            choosing={false}
            onSent={() => {}}
            thread
          />
        </div>
      )}
    </div>
  );
}
