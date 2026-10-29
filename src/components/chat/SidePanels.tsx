import { cn } from "@/lib/utils";
import { useState, type ReactNode } from "react";
import type { MessageView } from "../../protocol/eventStore";
import type { RunningReply } from "../../protocol/types";
import type { Outline, OutlineEntry } from "./outline";
import { Markdown } from "./Markdown";
import { MiniMeSurface } from "../minime/MiniMeSurface";
import { MiniMeAvatar } from "../minime/MiniMeAvatar";
import { ToolSheet } from "../shell/Sheet";
import { useMiniMes } from "../../hooks/useMiniMes";
import {
  StepComponents,
  StepMark,
  approvalAnswers,
  componentPlaces,
  stepState,
} from "./WorkflowProgress";

/** A panel docked to the right of a Conversation. */
export type Panel =
  | { kind: "outline" }
  | { kind: "jobs" }
  | { kind: "report" }
  | { kind: "steps"; messageId: string };

function SidePanel({
  title,
  meta,
  onClose,
  children,
}: {
  title: string;
  meta: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <ToolSheet title={title} meta={meta} onClose={onClose}>
      {children}
    </ToolSheet>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <h3 className="mb-2.5 font-serif text-subheading text-foreground">{label}</h3>
      {children}
    </section>
  );
}

/** What the Conversation uses: its Mini-Mes, files and tables and charts. Clicking an entry
 * scrolls to the next message it appears in, wrapping back to the first. */
export function OutlinePanel({ outline, onClose }: { outline: Outline; onClose: () => void }) {
  const miniMes = useMiniMes();
  // Per entry, the position in its `messageIds` of the message it last scrolled to.
  const [visited, setVisited] = useState<Map<string, number>>(new Map());

  function jump(entry: OutlineEntry) {
    const last = visited.get(entry.id);
    const next = last === undefined ? 0 : (last + 1) % entry.messageIds.length;
    setVisited(new Map(visited).set(entry.id, next));
    document
      .querySelector(`[data-message-id="${entry.messageIds[next]}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  const groups: Array<{ label: string; entries: OutlineEntry[]; sign: string }> = [
    { label: "Mini-Mes", entries: outline.miniMes, sign: "@" },
    { label: "Files", entries: outline.files, sign: "#" },
    { label: "Tables and charts", entries: outline.components, sign: "$" },
  ].filter((group) => group.entries.length > 0);
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0);

  return (
    <SidePanel title="Outline" meta={`${total} used`} onClose={onClose}>
      {groups.length === 0 && (
        <p className="text-body text-muted-foreground">Nothing has been used yet.</p>
      )}
      {groups.map((group) => (
        <Group key={group.label} label={group.label}>
          {/* `grid-cols-1` lets rows shrink below their content, so long names truncate. */}
          <ul className="grid grid-cols-1">
            {group.entries.map((entry) => {
              const miniMe =
                group.sign === "@" ? miniMes.find((m) => m.id === entry.id) : undefined;
              const name = miniMe?.name ?? entry.label;
              return (
                <li key={entry.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => jump(entry)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-150 ease-out hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {miniMe ? (
                      <MiniMeAvatar miniMe={miniMe} size={22} />
                    ) : (
                      <span aria-hidden className="w-[22px] shrink-0 text-center text-muted-foreground">
                        {group.sign}
                      </span>
                    )}
                    <span title={name} className="min-w-0 flex-1 truncate">
                      {name}
                    </span>
                    <span
                      aria-label={`in ${entry.messageIds.length} messages`}
                      className="ml-auto shrink-0 text-right text-meta text-muted-foreground tabular-nums"
                    >
                      {entry.messageIds.length}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Group>
      ))}
    </SidePanel>
  );
}

/** Every running reply, in any Project; `conversationId`'s are shown as in this one. */
export function JobsPanel({
  replies,
  conversationId,
  onOpen,
  onClose,
}: {
  replies: RunningReply[];
  conversationId: string;
  onOpen: (reply: RunningReply) => void;
  onClose: () => void;
}) {
  const miniMes = useMiniMes();
  return (
    <SidePanel title="Jobs" meta={`${replies.length} running`} onClose={onClose}>
      {replies.length === 0 ? (
        <p className="text-body text-muted-foreground">Nothing is running.</p>
      ) : (
        <ul className="grid gap-2">
          {replies.map((reply) => {
            const miniMe = miniMes.find((m) => m.id === reply.mini_me.id);
            return (
              <MiniMeSurface
                key={reply.message_id}
                miniMe={miniMe}
                render={<li />}
              >
                <button
                  type="button"
                  onClick={() => onOpen(reply)}
                  className="flex w-full items-center gap-3 p-4 text-left focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <MiniMeAvatar miniMe={miniMe} size={26} />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="font-medium">{reply.mini_me.name}</span>
                    <span className="truncate text-meta text-mm-ink">
                      {reply.step ? `Running ${reply.step}` : "Starting"}
                    </span>
                    <span className="truncate text-meta text-muted-foreground">
                      {reply.conversation_id === conversationId
                        ? "This conversation"
                        : `${reply.conversation_title} · ${reply.project_name}`}
                    </span>
                  </span>
                </button>
              </MiniMeSurface>
            );
          })}
        </ul>
      )}
    </SidePanel>
  );
}

const REPLY_STATE: Record<string, string> = {
  streaming: "Running…",
  paused: "Waiting for your approval",
  complete: "Done",
  failed: "Failed",
  cancelled: "Stopped",
};

/** A reply's Workflow as a vertical timeline: each Step, its outcome, its output and the
 * components it added. */
export function StepsPanel({ message, onClose }: { message: MessageView; onClose: () => void }) {
  const miniMes = useMiniMes();
  const miniMe = miniMes.find((m) => m.id === message.author.id);
  const answers = approvalAnswers(message.steps, message.components);
  const { byStep } = componentPlaces(message.steps, message.components, message.status);
  const done = message.steps.filter((s) => s.done).length;

  return (
    <SidePanel
      title={miniMe ? `${miniMe.name}'s Workflow` : "Workflow"}
      meta={`${REPLY_STATE[message.status] ?? message.status} · ${done} of ${message.steps.length} steps done`}
      onClose={onClose}
    >
      <ol aria-label="Workflow steps">
        {message.steps.map((step, index) => {
          const state = stepState(step, message.status);
          const decision = step.type === "condition" || step.type === "loop";
          const outcome = step.done ? (decision ? step.output : answers[index]) : undefined;
          const last = index === message.steps.length - 1;
          return (
            <li key={index} className="relative flex gap-3 pb-5 last:pb-0">
              {!last && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-5 bottom-0 left-[8.5px] w-px",
                    step.done ? "bg-primary" : "bg-border",
                  )}
                />
              )}
              <StepMark state={state} color={miniMe?.colors.solid} />
              <div className="grid min-w-0 flex-1 gap-1">
                <span className={cn("font-semibold", state === "pending" && "text-muted-foreground")}>
                  {step.name}
                  {outcome && (
                    <span className="font-normal text-muted-foreground"> · {outcome}</span>
                  )}
                </span>
                {state === "running" && message.progress && (
                  <span className="text-meta" style={{ color: miniMe?.colors.ink }}>
                    {message.progress.label}
                  </span>
                )}
                {step.type === "trait" && step.done && step.output && (
                  <div className="text-ink-2">
                    <Markdown content={step.output} size="ui" />
                  </div>
                )}
                {byStep.has(index) && (
                  <div className="mt-2 flex min-w-0 flex-col gap-3">
                    <StepComponents
                      components={byStep.get(index) ?? []}
                      messageId={message.id}
                      replyStatus={message.status}
                      color={miniMe?.colors.solid}
                    />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </SidePanel>
  );
}
