import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import type { Component, MessageStatus, MessageStep } from "../../protocol/types";
import { approvalState } from "../interactive/approval";
import { InteractiveComponent } from "../interactive/InteractiveComponent";
import { Markdown } from "./Markdown";

export type StepState = "done" | "running" | "waiting" | "pending";

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

/**
 * The answer to each approval Step run in `steps`, by index: the *n*-th run of an approval
 * Step asked the *n*-th `approval` component with its `step_id`, both in the order they were
 * added. Missing for other Steps, and for an approval without a component or an answer yet.
 */
export function approvalAnswers(
  steps: MessageStep[],
  components: Component[],
): Array<"approved" | "rejected" | undefined> {
  const asked = (stepId: string) =>
    components.filter(
      (c) => c.kind === "approval" && (c.data as { step_id?: string } | null)?.step_id === stepId,
    );
  const runs = new Map<string, number>();
  return steps.map((step) => {
    if (step.type !== "approval") return undefined;
    const run = runs.get(step.step_id) ?? 0;
    runs.set(step.step_id, run + 1);
    const state = approvalState(asked(step.step_id)[run]?.answer, "complete");
    return state === "approved" || state === "rejected" ? state : undefined;
  });
}

/**
 * Where a reply's components are drawn. While the reply streams or waits, all of them are
 * its own, below its text. Once it has ended, its own are those no Trait Step added and
 * those of its last Trait Step run; each other component goes with the Step run that added
 * it, under `byStep` at that run's index in `steps`.
 */
export function componentPlaces(
  steps: MessageStep[],
  components: Component[],
  replyStatus: MessageStatus,
): { own: Component[]; byStep: Map<number, Component[]> } {
  const byStep = new Map<number, Component[]>();
  if (replyStatus === "streaming" || replyStatus === "paused") {
    return { own: components, byStep };
  }
  const last = steps.map((s) => s.type).lastIndexOf("trait");
  const own: Component[] = [];
  for (const component of components) {
    const index = component.step_index;
    if (index == null || index === last) {
      own.push(component);
    } else {
      byStep.set(index, [...(byStep.get(index) ?? []), component]);
    }
  }
  return { own, byStep };
}

interface Props {
  steps: MessageStep[];
  /** The reply's Interactive Components: its approvals' answers, and what its Steps added. */
  components: Component[];
  messageId?: string;
  replyStatus: MessageStatus;
  /** The Mini-Me's solid colour, for the running Step's spinner. */
  color?: string;
  /** Opens the Steps as a timeline beside the Conversation, when the view offers one. */
  onShowSteps?: () => void;
  /** Whether that timeline is open for this reply. */
  stepsShown?: boolean;
}

/** The Steps a reply's Workflow has run, in a row. A done Trait Step opens its output and
 * the components it added. */
export function WorkflowProgress({
  steps,
  components,
  messageId,
  replyStatus,
  color,
  onShowSteps,
  stepsShown = false,
}: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const opened = open === null ? null : steps[open];
  const answers = approvalAnswers(steps, components);
  const { byStep } = componentPlaces(steps, components, replyStatus);
  const added = open === null ? [] : (byStep.get(open) ?? []);

  return (
    <div className="rounded-xl border border-card-edge bg-card px-4 py-3">
      <div className="flex items-start gap-3">
        <ol
          aria-label="Workflow progress"
          className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2"
        >
          {steps.map((step, index) => {
            const state = stepState(step, replyStatus);
            const decision = step.type === "condition" || step.type === "loop";
            // A decision's outcome, or an approval's answer.
            const outcome = step.done ? (decision ? step.output : answers[index]) : undefined;
            const label = (
              <>
                <StepMark state={state} color={color} />
                <span className={cn("text-ui", state === "pending" && "text-muted-foreground")}>
                  {step.name}
                  {outcome && <span className="text-muted-foreground"> · {outcome}</span>}
                </span>
              </>
            );
            const openable =
              step.type === "trait" && step.done && (step.output || byStep.has(index));
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
        {onShowSteps && (
          <Button
            variant="outline"
            size="xs"
            className="shrink-0 rounded-full"
            aria-pressed={stepsShown}
            onClick={onShowSteps}
          >
            {stepsShown ? "Showing steps" : "Show steps"}
          </Button>
        )}
      </div>
      {opened && (opened.output || added.length > 0) && (
        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
          {opened.output && (
            <div className="text-ink-2">
              <Markdown content={opened.output} size="ui" />
            </div>
          )}
          <StepComponents
            components={added}
            messageId={messageId}
            replyStatus={replyStatus}
            color={color}
          />
        </div>
      )}
    </div>
  );
}

/** The components a Step run added, drawn below its output. */
export function StepComponents({
  components,
  messageId,
  replyStatus,
  color,
}: {
  components: Component[];
  messageId?: string;
  replyStatus: MessageStatus;
  color?: string;
}) {
  return components.map((component) => (
    <InteractiveComponent
      key={component.id}
      component={component}
      messageId={messageId}
      replyStatus={replyStatus}
      color={color}
    />
  ));
}

export function StepMark({ state, color }: { state: StepState; color?: string }) {
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
