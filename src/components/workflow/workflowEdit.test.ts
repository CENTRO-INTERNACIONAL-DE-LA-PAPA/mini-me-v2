import { describe, expect, it } from "vitest";
import type { WorkflowStep } from "../../protocol/types";
import {
  allIds,
  asksBeforeRunning,
  findStep,
  insertStep,
  moveStep,
  newStep,
  removeStep,
  setAskBeforeRunning,
} from "./workflowEdit";

const trait = (id: string): WorkflowStep => ({ id, type: "trait", trait: `t-${id}` });

/** scout, then a condition with "Yes": [plan] and "No": [], then a loop of [refute]. */
const workflow: WorkflowStep[] = [
  trait("scout"),
  {
    id: "check",
    type: "condition",
    question: "Testable?",
    branches: [
      { label: "Yes", steps: [trait("plan")] },
      { label: "No", steps: [] },
    ],
  },
  { id: "again", type: "loop", question: "Again?", max_iterations: 2, steps: [trait("refute")] },
];

const ids = (steps: WorkflowStep[] | null) => (steps ? allIds(steps) : null);

describe("workflow edits", () => {
  it("inserts into a branch", () => {
    const next = insertStep(
      workflow,
      { list: [{ step: 1, branch: 1 }], index: 0 },
      trait("wonder"),
    );
    expect(ids(next)).toEqual(["scout", "check", "plan", "wonder", "again", "refute"]);
    expect(ids(workflow)).toEqual(["scout", "check", "plan", "again", "refute"]);
  });

  it("moves down within a list and into a branch", () => {
    expect(ids(moveStep(workflow, "scout", { list: [], index: 2 }))).toEqual([
      "check",
      "plan",
      "scout",
      "again",
      "refute",
    ]);
    const intoBranch = moveStep(workflow, "scout", { list: [{ step: 1, branch: 1 }], index: 0 });
    expect(ids(intoBranch)).toEqual(["check", "plan", "scout", "again", "refute"]);
    expect(findStep(intoBranch!, "scout")).toEqual(trait("scout"));
  });

  it("refuses to drop a Step inside itself", () => {
    expect(moveStep(workflow, "again", { list: [{ step: 2, loop: true }], index: 1 })).toBeNull();
  });

  it("removes a loop with its Steps, but never the last Step", () => {
    expect(ids(removeStep(workflow, "again"))).toEqual(["scout", "check", "plan"]);
    expect(removeStep([trait("scout")], "scout")).toBeNull();
  });

  it("adds and removes the approval before a Step", () => {
    const asked = setAskBeforeRunning(workflow, "refute", true, "Refute");
    const loop = asked[2].type === "loop" ? asked[2].steps : [];
    expect(loop[0]).toMatchObject({ type: "approval", prompt: "Run Refute?" });
    expect(asksBeforeRunning(asked, "refute", "Refute")).toBe(true);
    expect(setAskBeforeRunning(asked, "refute", false, "Refute")).toEqual(workflow);
  });

  it("leaves an approval the user wrote alone", () => {
    const own: WorkflowStep[] = [
      { id: "check", type: "approval", prompt: "Is the dataset the latest?" },
      trait("plan"),
    ];
    expect(asksBeforeRunning(own, "plan", "Plan")).toBe(false);
    expect(setAskBeforeRunning(own, "plan", false, "Plan")).toBe(own);
    expect(ids(setAskBeforeRunning(own, "plan", true, "Plan"))).toEqual([
      "check",
      "approval",
      "plan",
    ]);
  });

  it("makes IDs unique across nested Steps", () => {
    expect(newStep("trait", workflow, { id: "t", name: "Plan" }).id).toBe("plan-2");
    expect(newStep("condition", workflow)).toMatchObject({
      id: "condition",
      branches: [{ label: "Yes" }, { label: "No" }],
    });
  });
});
