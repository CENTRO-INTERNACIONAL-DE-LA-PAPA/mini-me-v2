import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { CircleAlertIcon, CheckIcon, PlusIcon, XIcon } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { PLACEHOLDER_JOBS, PLACEHOLDER_TODOS } from "../placeholders";
import type { MessageView } from "../protocol/eventStore";
import type { MiniMe } from "../protocol/types";
import { Markdown } from "./Markdown";
import { MiniMeAvatar } from "./MiniMeAvatar";
import { MiniMePill } from "./MiniMePill";
import { SampleTag } from "./SampleTag";
import { useMiniMes } from "./useMiniMes";
import {
  StepComponents,
  StepMark,
  approvalAnswers,
  componentPlaces,
  stepState,
} from "./WorkflowProgress";

/** A panel docked to the right of a Conversation. */
export type Panel = { kind: "todo" } | { kind: "jobs" } | { kind: "steps"; messageId: string };

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
    <aside
      aria-label={title}
      className="flex w-[400px] shrink-0 flex-col border-l border-border bg-background"
    >
      <header className="flex items-start gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-body font-bold">{title}</h2>
          <p className="truncate text-meta text-muted-foreground">{meta}</p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close" title="Close" onClick={onClose}>
          <XIcon />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
    </aside>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <h3 className="mb-2 text-meta text-muted-foreground">{label}</h3>
      {children}
    </section>
  );
}

const byName = (miniMes: MiniMe[], name: string | null) =>
  name ? miniMes.find((m) => m.name === name) : undefined;

/** Tasks for the user, including ones Mini-Mes hand back. Sample data until to-dos exist. */
export function TodoPanel({ onClose }: { onClose: () => void }) {
  const miniMes = useMiniMes();
  const [todos, setTodos] = useState(PLACEHOLDER_TODOS ?? []);
  const [draft, setDraft] = useState("");
  const open = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);

  function add(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    setTodos([{ title: draft.trim(), miniMe: null, done: false }, ...todos]);
    setDraft("");
  }

  const row = (todo: (typeof todos)[number]) => (
    <li key={todo.title} className="flex gap-3 border-b border-border py-3 last:border-b-0">
      <Checkbox
        className="mt-0.5"
        checked={todo.done}
        aria-label={todo.title}
        onCheckedChange={(checked) =>
          setTodos(todos.map((t) => (t === todo ? { ...t, done: checked } : t)))
        }
      />
      <div className="grid min-w-0 gap-1">
        <span className={cn(todo.done && "text-muted-foreground line-through")}>{todo.title}</span>
        {!todo.done &&
          (todo.miniMe ? (
            <span>
              <MiniMePill miniMe={byName(miniMes, todo.miniMe)}>{todo.miniMe}</MiniMePill>
            </span>
          ) : (
            <span className="text-meta text-muted-foreground">Added by you</span>
          ))}
      </div>
    </li>
  );

  return (
    <SidePanel
      title="To-do"
      meta={`${open.length} open · ${done.length} done`}
      onClose={onClose}
    >
      <div className="mb-5 flex items-center justify-between">
        <SampleTag />
      </div>
      <form onSubmit={add} className="relative">
        <PlusIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Add a to-do"
          placeholder="Add a to-do"
          className="pl-9"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </form>
      <div className="mt-5">
        <Group label={`Needs you · ${open.length}`}>
          <ul>{open.map(row)}</ul>
        </Group>
        {done.length > 0 && (
          <Group label={`Done · ${done.length}`}>
            <ul>{done.map(row)}</ul>
          </Group>
        )}
      </div>
    </SidePanel>
  );
}

/** Work that runs outside a reply: now, next or on a schedule. Sample data until jobs exist. */
export function JobsPanel({ onClose }: { onClose: () => void }) {
  const miniMes = useMiniMes();
  const jobs = PLACEHOLDER_JOBS;
  if (!jobs) return null;
  return (
    <SidePanel
      title="Background jobs"
      meta={`${jobs.running.length} running · ${jobs.queued.length} queued · ${jobs.scheduled.length} scheduled`}
      onClose={onClose}
    >
      <div className="mb-5">
        <SampleTag />
      </div>
      <Group label="Running">
        {jobs.running.map((job) => {
          const miniMe = byName(miniMes, job.miniMe);
          return (
            <div key={job.title} className="grid gap-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <MiniMeAvatar miniMe={miniMe} size={26} />
                <div className="grid min-w-0 flex-1">
                  <span className="font-medium">{job.title}</span>
                  <span className="text-meta text-muted-foreground">{job.miniMe}</span>
                </div>
              </div>
              <Progress value={job.progress * 100} color={miniMe?.colors.solid}>
                <span className="flex w-full justify-between text-meta">
                  <span>{job.step}</span>
                  <span style={{ color: miniMe?.colors.ink }}>
                    {Math.round(job.progress * 100)}%
                  </span>
                </span>
              </Progress>
              <div className="flex gap-1.5">
                <Button variant="outline" size="xs" disabled>
                  Pause
                </Button>
                <Button variant="destructive" size="xs" disabled>
                  Stop
                </Button>
              </div>
            </div>
          );
        })}
      </Group>
      <Group label={`Queued · ${jobs.queued.length}`}>
        {jobs.queued.map((job) => (
          <JobLine key={job.title} title={job.title} detail={job.detail} />
        ))}
      </Group>
      <Group label={`Scheduled · ${jobs.scheduled.length}`}>
        {jobs.scheduled.map((job) => (
          <JobLine key={job.title} title={job.title} detail={job.detail}>
            <Switch defaultChecked aria-label={`Run ${job.title}`} />
          </JobLine>
        ))}
      </Group>
      <Group label="Recent">
        {jobs.recent.map((job) => (
          <JobLine
            key={job.title}
            title={job.title}
            detail={job.detail}
            icon={
              job.failed ? (
                <CircleAlertIcon className="size-[18px] text-destructive" />
              ) : (
                <span className="flex size-[18px] items-center justify-center rounded-full bg-primary">
                  <CheckIcon className="size-3 text-primary-foreground" strokeWidth={2} />
                </span>
              )
            }
            failed={job.failed}
          >
            {job.failed && (
              <Button variant="outline" size="xs" disabled>
                Retry
              </Button>
            )}
          </JobLine>
        ))}
      </Group>
    </SidePanel>
  );
}

function JobLine({
  title,
  detail,
  icon,
  failed,
  children,
}: {
  title: string;
  detail: string;
  icon?: ReactNode;
  failed?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0">
      {icon}
      <div className="grid min-w-0 flex-1">
        <span className="truncate">{title}</span>
        <span className={cn("text-meta", failed ? "text-destructive" : "text-muted-foreground")}>
          {detail}
        </span>
      </div>
      {children}
    </div>
  );
}

const REPLY_STATE: Record<string, string> = {
  streaming: "Running",
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
