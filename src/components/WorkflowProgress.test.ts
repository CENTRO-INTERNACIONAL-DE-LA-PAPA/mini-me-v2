import { describe, expect, it } from "vitest";
import type { Component, MessageStep } from "../protocol/types";
import { approvalAnswers } from "./WorkflowProgress";

const step = (step_id: string, type: MessageStep["type"], done = true): MessageStep => ({
  step_id,
  type,
  name: step_id,
  output: null,
  done,
});

const approval = (id: string, step_id: string, answer: unknown): Component => ({
  id,
  kind: "approval",
  version: 1,
  data: { step_id, prompt: "Go on?" },
  text: "Go on?",
  answer,
});

describe("approvalAnswers", () => {
  it("gives each approval Step run the answer of its own approval", () => {
    const steps = [
      step("plan", "trait"),
      step("ask", "approval"),
      step("refine", "trait"),
      step("ask", "approval"),
      step("check", "approval", false),
    ];
    const components = [
      approval("c1", "ask", { approved: true }),
      approval("c2", "ask", { approved: false }),
      approval("c3", "check", null),
    ];
    expect(approvalAnswers(steps, components)).toEqual([
      undefined,
      "approved",
      undefined,
      "rejected",
      undefined,
    ]);
  });

  it("gives nothing for an approval Step without a component", () => {
    expect(approvalAnswers([step("ask", "approval")], [])).toEqual([undefined]);
  });
});
