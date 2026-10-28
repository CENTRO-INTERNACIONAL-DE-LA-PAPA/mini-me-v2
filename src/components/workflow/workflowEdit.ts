import type { WorkflowStep } from "../../protocol/types";
import { nextStepId } from "../library/library";

/** One level down from a list of Steps: into a branch of the Step at `step`, or into the
 * Steps of the loop at `step`. */
export type PathPart = { step: number; branch: number } | { step: number; loop: true };

/** A list of Steps, by the path from the Workflow's top-level list (`[]`). */
export type ListPath = PathPart[];

/** A place between Steps: inserting there puts a Step at `index` of the list at `list`. */
export interface Slot {
  list: ListPath;
  index: number;
}

export type StepKind = WorkflowStep["type"];

function listAt(steps: WorkflowStep[], path: ListPath): WorkflowStep[] {
  let list = steps;
  for (const part of path) {
    const step = list[part.step];
    if ("loop" in part) {
      if (step?.type !== "loop") throw new Error("path does not lead to a loop");
      list = step.steps;
    } else {
      if (step?.type !== "condition" && step?.type !== "parallel") {
        throw new Error("path does not lead to branches");
      }
      list = step.branches[part.branch].steps;
    }
  }
  return list;
}

/** `steps` with the list at `path` replaced by `change(list)`, sharing everything else. */
function withList(
  steps: WorkflowStep[],
  path: ListPath,
  change: (list: WorkflowStep[]) => WorkflowStep[],
): WorkflowStep[] {
  if (path.length === 0) return change(steps);
  const [part, ...rest] = path;
  return steps.map((step, i) => {
    if (i !== part.step) return step;
    if ("loop" in part && step.type === "loop") {
      return { ...step, steps: withList(step.steps, rest, change) };
    }
    if (!("loop" in part) && (step.type === "condition" || step.type === "parallel")) {
      const branches = step.branches.map((b, j) =>
        j === part.branch ? { ...b, steps: withList(b.steps, rest, change) } : b,
      );
      return { ...step, branches };
    }
    throw new Error("path does not lead to a list");
  });
}

/** The lists nested directly inside `step`, with the path part leading to each. */
function innerLists(step: WorkflowStep, index: number): Array<[PathPart, WorkflowStep[]]> {
  if (step.type === "loop") return [[{ step: index, loop: true }, step.steps]];
  if (step.type === "condition" || step.type === "parallel") {
    return step.branches.map((b, j) => [{ step: index, branch: j }, b.steps]);
  }
  return [];
}

/** Where the Step with `id` is: its list and its index there. */
export function locate(steps: WorkflowStep[], id: string, path: ListPath = []): Slot | null {
  for (const [i, step] of steps.entries()) {
    if (step.id === id) return { list: path, index: i };
    for (const [part, inner] of innerLists(step, i)) {
      const found = locate(inner, id, [...path, part]);
      if (found) return found;
    }
  }
  return null;
}

export function findStep(steps: WorkflowStep[], id: string): WorkflowStep | null {
  const at = locate(steps, id);
  return at && listAt(steps, at.list)[at.index];
}

/** Every Step's ID, nested ones included. */
export function allIds(steps: WorkflowStep[]): string[] {
  return steps.flatMap((step, i) => [
    step.id,
    ...innerLists(step, i).flatMap(([, inner]) => allIds(inner)),
  ]);
}

const samePath = (a: ListPath, b: ListPath) => JSON.stringify(a) === JSON.stringify(b);

/** Whether the list at `path` is inside the Step at `at`. */
function isInside(path: ListPath, at: Slot): boolean {
  return (
    path.length > at.list.length &&
    samePath(path.slice(0, at.list.length), at.list) &&
    path[at.list.length].step === at.index
  );
}

const BRANCH_LABELS: Record<"condition" | "parallel", [string, string]> = {
  condition: ["Yes", "No"],
  parallel: ["Branch 1", "Branch 2"],
};

const emptyBranches = (kind: "condition" | "parallel") =>
  BRANCH_LABELS[kind].map((label) => ({ label, steps: [] }));

/** A new Step of `kind` with its defaults and an ID no Step in `steps` has. A Trait Step needs
 * the Trait it runs. */
export function newStep(
  kind: StepKind,
  steps: WorkflowStep[],
  trait?: { id: string; name: string },
): WorkflowStep {
  const id = nextStepId(kind === "trait" ? (trait?.name ?? "trait") : kind, allIds(steps));
  switch (kind) {
    case "trait":
      if (!trait) throw new Error("a Trait Step needs a Trait");
      return { id, type: "trait", trait: trait.id };
    case "approval":
      return { id, type: "approval", prompt: "Continue?" };
    case "condition":
      return { id, type: "condition", question: "", branches: emptyBranches(kind) };
    case "parallel":
      return { id, type: "parallel", branches: emptyBranches(kind) };
    case "loop":
      return { id, type: "loop", question: "", max_iterations: 2, steps: [] };
  }
}

export function insertStep(steps: WorkflowStep[], slot: Slot, step: WorkflowStep): WorkflowStep[] {
  return withList(steps, slot.list, (list) => [
    ...list.slice(0, slot.index),
    step,
    ...list.slice(slot.index),
  ]);
}

/** Moves the Step with `id`, and everything inside it, to `slot`. Null when `slot` is inside
 * that Step or the Step is unknown. */
export function moveStep(steps: WorkflowStep[], id: string, slot: Slot): WorkflowStep[] | null {
  const at = locate(steps, id);
  if (!at || isInside(slot.list, at)) return null;
  const step = listAt(steps, at.list)[at.index];
  const removed = withList(steps, at.list, (list) => list.filter((_, i) => i !== at.index));
  // Removing the Step shifts everything after it in its list up by one: the slot's index when
  // it is in the same list, or the path part that leads through a later sibling.
  const list = slot.list.map((part, depth) =>
    depth === at.list.length && samePath(slot.list.slice(0, depth), at.list) && part.step > at.index
      ? { ...part, step: part.step - 1 }
      : part,
  );
  const index = samePath(slot.list, at.list) && slot.index > at.index ? slot.index - 1 : slot.index;
  return insertStep(removed, { list, index }, step);
}

/** Removes the Step with `id` and everything inside it. Null when that would leave the
 * Workflow without Steps, or the Step is unknown. */
export function removeStep(steps: WorkflowStep[], id: string): WorkflowStep[] | null {
  const at = locate(steps, id);
  if (!at) return null;
  const removed = withList(steps, at.list, (list) => list.filter((_, i) => i !== at.index));
  return removed.length === 0 ? null : removed;
}

export function updateStep(
  steps: WorkflowStep[],
  id: string,
  change: (step: WorkflowStep) => WorkflowStep,
): WorkflowStep[] {
  const at = locate(steps, id);
  if (!at) return steps;
  return withList(steps, at.list, (list) =>
    list.map((step, i) => (i === at.index ? change(step) : step)),
  );
}

const askPrompt = (traitName: string) => `Run ${traitName}?`;

/** Whether the approval right before the Step with `id` is the one "Ask before running" adds:
 * "Run <traitName>?". An approval written by the user does not count. */
export function asksBeforeRunning(steps: WorkflowStep[], id: string, traitName: string): boolean {
  const at = locate(steps, id);
  const before = at && at.index > 0 ? listAt(steps, at.list)[at.index - 1] : null;
  return before?.type === "approval" && before.prompt === askPrompt(traitName);
}

/** Adds the approval "Run <traitName>?" right before the Step with `id`, or removes that
 * approval. Other approvals are left alone. */
export function setAskBeforeRunning(
  steps: WorkflowStep[],
  id: string,
  on: boolean,
  traitName: string,
): WorkflowStep[] {
  const at = locate(steps, id);
  if (!at || on === asksBeforeRunning(steps, id, traitName)) return steps;
  if (!on) {
    return withList(steps, at.list, (list) => list.filter((_, i) => i !== at.index - 1));
  }
  const approval: WorkflowStep = {
    id: nextStepId("approval", allIds(steps)),
    type: "approval",
    prompt: askPrompt(traitName),
  };
  return insertStep(steps, at, approval);
}

/** Whether `slot` is inside the Step with `id`, where that Step cannot be dropped. */
export function isSlotInside(steps: WorkflowStep[], id: string, slot: Slot): boolean {
  const at = locate(steps, id);
  return !!at && isInside(slot.list, at);
}

/** The Traits the Trait Steps run, each once, in Workflow order. */
export function traitIds(steps: WorkflowStep[]): string[] {
  const ids: string[] = [];
  const walk = (list: WorkflowStep[]) =>
    list.forEach((step, i) => {
      if (step.type === "trait" && !ids.includes(step.trait)) ids.push(step.trait);
      innerLists(step, i).forEach(([, inner]) => walk(inner));
    });
  walk(steps);
  return ids;
}
