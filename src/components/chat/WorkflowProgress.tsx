import { ComponentCard } from "../interactive/ComponentCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckIcon } from "lucide-react";
import type { Component, MessageStatus, MessageStep } from "../../protocol/types";
import { approvalState } from "../interactive/approval";
import { InteractiveComponent } from "../interactive/InteractiveComponent";

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

/** How an approval's answer reads after its Step's name. */
export const ANSWER_LABELS = {
  approved: "Approved",
  rejected: "Rejected",
  answered: "Answered",
  skipped: "Skipped",
} as const;

/** Each approval Step run's component, by index in `steps`: the n-th run of an approval Step
 * asked the n-th `approval` component with its `step_id`, both in the order added. Missing for
 * other Steps, and for an approval without a component yet. */
export function approvalComponents(
  steps: MessageStep[],
  components: Component[],
): Array<Component | undefined> {
  const asked = (stepId: string) =>
    components.filter(
      (c) => c.kind === "approval" && (c.preview as { step_id?: string } | null)?.step_id === stepId,
    );
  const runs = new Map<string, number>();
  return steps.map((step) => {
    if (step.type !== "approval") return undefined;
    const run = runs.get(step.step_id) ?? 0;
    runs.set(step.step_id, run + 1);
    return asked(step.step_id)[run];
  });
}

export function approvalAnswers(
  steps: MessageStep[],
  components: Component[],
): Array<keyof typeof ANSWER_LABELS | undefined> {
  return approvalComponents(steps, components).map((component) => {
    const state = component && approvalState(component.answer, "complete");
    return state === "asking" || state === "closed" ? undefined : state;
  });
}

/** Where a reply's components go, so text still arriving never pushes one down: each shows
 * with its done Step run, under `byStep` at its index in `steps`. Once the reply ended, those no
 * Step added, those of Step runs that show their results, and a one-Step Workflow's are also
 * the reply's own, below its text, as is an approval while the reply waits on it. */
export function componentPlaces(
  steps: MessageStep[],
  components: Component[],
  replyStatus: MessageStatus,
): { own: Component[]; byStep: Map<number, Component[]> } {
  const byStep = new Map<number, Component[]>();
  const own: Component[] = [];
  const ended = replyStatus !== "streaming" && replyStatus !== "paused";
  const oneStep = steps.length === 1 && steps[0].type === "trait";
  for (const component of components) {
    const index = component.step_index;
    if (component.kind === "approval" && replyStatus === "paused") {
      own.push(component);
      continue;
    }
    const step = index == null ? undefined : steps[index];
    if (index != null && step?.done) {
      byStep.set(index, [...(byStep.get(index) ?? []), component]);
    }
    if (ended && (index == null || step?.show_results || (oneStep && index === 0))) {
      own.push(component);
    }
  }
  return { own, byStep };
}

interface Props {
  steps: MessageStep[];
  /** The reply's Interactive Components: its approvals' answers, and what its Steps added. */
  components: Component[];
  replyStatus: MessageStatus;
  /** The Mini-Me's solid colour, for the running Step's spinner. */
  color?: string;
  /** Opens the Steps as a timeline beside the Conversation, when the view offers one. */
  onShowSteps?: () => void;
  /** Whether that timeline is open for this reply. */
  stepsShown?: boolean;
  selected: number | null;
  onSelect: (index: number | null) => void;
}

/** The Steps a reply's Workflow has run, in a row. A done Trait Step with an output or
 * components, and an answered written approval, can be selected. */
export function WorkflowProgress({
  steps,
  components,
  replyStatus,
  color,
  onShowSteps,
  stepsShown = false,
  selected,
  onSelect,
}: Props) {
  const answers = approvalAnswers(steps, components);
  const { byStep } = componentPlaces(steps, components, replyStatus);

  return (
    <ComponentCard className="gap-0">
      <div className="flex items-start gap-3">
        <ol
          aria-label="Workflow progress"
          className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2"
        >
          {steps.map((step, index) => {
            const state = stepState(step, replyStatus);
            const decision = step.type === "condition" || step.type === "loop";
            // A decision's outcome, or an approval's answer.
            const answer = answers[index];
            const outcome = step.done ? (decision ? step.output : answer && ANSWER_LABELS[answer]) : undefined;
            const label = (
              <>
                <StepMark state={state} color={color} />
                <span className={cn("text-ui", state === "pending" && "text-muted-foreground")}>
                  {step.name}
                  {outcome && <span className="ms-2 text-muted-foreground">{outcome}</span>}
                </span>
              </>
            );
            const openable =
              step.done &&
              ((step.type === "trait" && (step.output || byStep.has(index))) ||
                answers[index] === "answered");
            return (
              <li key={index} className="flex items-center">
                {openable ? (
                  <Button
                    variant="link"
                    className={cn("gap-2", selected === index && "underline")}
                    aria-pressed={selected === index}
                    onClick={() => onSelect(selected === index ? null : index)}
                  >
                    {label}
                  </Button>
                ) : (
                  <span className="flex items-center gap-2">{label}</span>
                )}
              </li>
            );
          })}
        </ol>
        {onShowSteps && (
          <Button
            variant="secondary"
            size="xs"
            className="shrink-0 rounded-full"
            aria-pressed={stepsShown}
            onClick={onShowSteps}
          >
            {stepsShown ? "Showing steps" : "Show steps"}
          </Button>
        )}
      </div>
    </ComponentCard>
  );
}

export function WrittenAnswer({ approval }: { approval: Component }) {
  const text = (approval.answer as { text?: string } | null)?.text;
  return (
    <>
      <p className="text-ui whitespace-pre-wrap text-muted-foreground">{approval.text}</p>
      {text && <p className="text-ui whitespace-pre-wrap text-ink-2">{text}</p>}
    </>
  );
}

/** The components a Step run added, drawn below its output. */
export function StepComponents({
  components,
  projectId,
  messageId,
  replyStatus,
  color,
}: {
  components: Component[];
  projectId?: string;
  messageId?: string;
  replyStatus: MessageStatus;
  color?: string;
}) {
  return components.map((component) => (
    <InteractiveComponent
      key={component.id}
      component={component}
      projectId={projectId}
      messageId={messageId}
      replyStatus={replyStatus}
      color={color}
    />
  ));
}

export function StepMark({ state, color }: { state: StepState; color?: string }) {
  const size = "size-4.5 shrink-0 rounded-full";
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
