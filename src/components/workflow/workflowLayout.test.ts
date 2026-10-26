import { describe, expect, it } from "vitest";
import library from "../../../src-tauri/library/builtin.json";
import type { WorkflowStep } from "../../protocol/types";
import type { Slot } from "./workflowEdit";
import { END_ID, layoutWorkflow } from "./workflowLayout";

/** builtin.json leaves `type` out of Trait Steps; the core adds it when sending Workflows. */
function typed(steps: unknown[]): WorkflowStep[] {
  return steps.map((raw) => {
    const step = { type: "trait", ...(raw as object) } as WorkflowStep & {
      steps?: unknown[];
      branches?: { label: string; steps: unknown[] }[];
    };
    if (step.steps) step.steps = typed(step.steps);
    if (step.branches) step.branches = step.branches.map((b) => ({ ...b, steps: typed(b.steps) }));
    return step;
  });
}

const investigator = typed(library.mini_mes.find((m) => m.name === "Investigator")!.workflow.steps);

/** Every slot the canvas offers, from connectors and empty-slot nodes. */
function slots(steps: WorkflowStep[]): Slot[] {
  const { nodes, edges } = layoutWorkflow(steps);
  return [
    ...edges.flatMap((e) => (e.data?.slot ? [e.data.slot] : [])),
    ...nodes.flatMap((n) => (n.data.slot ? [n.data.slot] : [])),
  ];
}

describe("layoutWorkflow", () => {
  it("puts parallel branches side by side and what follows below both", () => {
    const { nodes } = layoutWorkflow(investigator);
    const at = (id: string) => nodes.find((n) => n.id === id)!;
    expect(at("scout").position.y).toBe(at("wonder").position.y);
    expect(at("scout").position.x).toBeLessThan(at("wonder").position.x);
    expect(at("plan").position.y).toBeGreaterThan(at("scout").position.y + at("scout").height!);
    expect(at(END_ID).position.y).toBeGreaterThan(at("experiment").position.y);
  });

  it("offers every place between Steps exactly once", () => {
    const keys = slots(investigator).map((s) => JSON.stringify(s));
    expect(new Set(keys).size).toBe(keys.length);
    // Top level: before, between and after its four Steps.
    expect(keys.filter((k) => k.startsWith('{"list":[],'))).toHaveLength(5);
    // The loop's two Steps leave three places.
    const loop = JSON.stringify([{ step: 2, loop: true }]);
    expect(keys.filter((k) => k.startsWith(`{"list":${loop},`))).toHaveLength(3);
  });

  it("keeps a Step named like the end pill apart from it", () => {
    const { nodes } = layoutWorkflow([{ id: "end", type: "trait", trait: "t" }]);
    expect(nodes.filter((n) => n.id === "end")).toHaveLength(1);
    expect(nodes.filter((n) => n.id === END_ID)).toHaveLength(1);
  });

  it("gives an empty branch a slot node", () => {
    const steps: WorkflowStep[] = [
      {
        id: "check",
        type: "condition",
        question: "Ok?",
        branches: [
          { label: "Yes", steps: [{ id: "plan", type: "trait", trait: "t" }] },
          { label: "No", steps: [] },
        ],
      },
    ];
    const { nodes } = layoutWorkflow(steps);
    const slot = nodes.find((n) => n.type === "slot");
    expect(slot?.data.slot).toEqual({ list: [{ step: 0, branch: 1 }], index: 0 });
  });
});
