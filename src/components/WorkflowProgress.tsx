import { cn } from "@/lib/utils";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import type { MessageStatus, MessageStep } from "../protocol/types";
import { Markdown } from "./Markdown";

type StepState = "done" | "running" | "waiting" | "pending";

/** How a Step is drawn: done once completed; otherwise running while its reply streams,
 * waiting while the reply waits for an approval, and pending after the reply ended. */
export function stepState(step: MessageStep, replyStatus: MessageStatus): StepState {
  if (step.done) return "done";
  if (replyStatus === "streaming") return "running";
  if (replyStatus === "paused") return "waiting";
  return "pending";
}

/** Whether a reply shows its Workflow's progress: one-Step Workflows show none. */
export function showsProgress(steps: MessageStep[]): boolean {
  return steps.length > 1 || steps.some((s) => s.type !== "trait");
}

interface Props {
  steps: MessageStep[];
  replyStatus: MessageStatus;
  /** The Mini-Me's solid colour, for the running Step's spinner. */
  color?: string;
}

/** The Steps a reply's Workflow has run, in a row. A done Trait Step opens its output. */
export function WorkflowProgress({ steps, replyStatus, color }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const opened = open === null ? null : steps[open];

  return (
    <div className="rounded-[10px] border border-border bg-card px-4 py-3">
      <ol aria-label="Workflow progress" className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {steps.map((step, index) => {
          const state = stepState(step, replyStatus);
          const decision = step.type === "condition" || step.type === "loop";
          const label = (
            <>
              <StepMark state={state} color={color} />
              <span className={cn("text-ui", state === "pending" && "text-muted-foreground")}>
                {step.name}
                {decision && step.done && step.output && (
                  <span className="text-muted-foreground"> · {step.output}</span>
                )}
              </span>
            </>
          );
          const openable = step.type === "trait" && step.done && step.output;
          return (
            <li key={index} className="flex items-center">
              {openable ? (
                <button
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md",
                    "underline-offset-4 hover:underline",
                    open === index && "underline",
                  )}
                  aria-expanded={open === index}
                  onClick={() => setOpen(open === index ? null : index)}
                >
                  {label}
                </button>
              ) : (
                <span className="flex items-center gap-2">{label}</span>
              )}
            </li>
          );
        })}
      </ol>
      {opened?.output && (
        <div className="mt-3 border-t border-border pt-3 text-ink-2">
          <Markdown content={opened.output} size="ui" />
        </div>
      )}
    </div>
  );
}

function StepMark({ state, color }: { state: StepState; color?: string }) {
  const size = "size-[18px] shrink-0 rounded-full";
  switch (state) {
    case "done":
      return (
        <span aria-label="Done" className={cn(size, "flex items-center justify-center bg-primary")}>
          <CheckIcon className="size-3 text-primary-foreground" strokeWidth={2} />
        </span>
      );
    case "running":
      return (
        <span
          aria-label="Running"
          className={cn(size, "animate-spin border-2 border-foreground border-t-transparent")}
          style={color ? { borderColor: color, borderTopColor: "transparent" } : undefined}
        />
      );
    default:
      return (
        <span
          aria-label={state === "waiting" ? "Waiting for your approval" : "Not run"}
          className={cn(size, "border-[1.5px] border-border-strong bg-card")}
        />
      );
  }
}
