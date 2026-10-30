import { describe, expect, it } from "vitest";
import type { Component, MessageStep } from "../../protocol/types";
import { approvalAnswers, componentPlaces } from "./WorkflowProgress";

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

describe("componentPlaces", () => {
  const steps = [step("find", "trait"), step("ask", "approval"), step("summarize", "trait")];
  const added = (id: string, step_index?: number): Component => ({
    id,
    kind: "paper-sources",
    version: 1,
    data: { papers: [] },
    text: id,
    answer: null,
    step_index,
  });
  const sources = added("sources", 0);
  const chart = added("chart", 2);
  const plain = added("plain");

  it("draws a done Step's components with that Step while the reply runs", () => {
    const running = [step("find", "trait"), step("ask", "approval"), step("summarize", "trait", false)];
    const streaming = componentPlaces(running, [sources, chart, plain], "streaming");
    expect(streaming.own).toEqual([]);
    expect([...streaming.byStep]).toEqual([[0, [sources]]]);
  });

  it("keeps a done Step's components with it while an approval waits under the reply", () => {
    const asking = [step("find", "trait"), step("ask", "approval", false)];
    const approval = { ...added("approval", 1), kind: "approval" };
    const paused = componentPlaces(asking, [sources, approval], "paused");
    expect(paused.own).toEqual([approval]);
    expect([...paused.byStep]).toEqual([[0, [sources]]]);
  });

  it("moves an earlier Step's components to that Step once the reply ends", () => {
    const places = componentPlaces(steps, [sources, chart, plain], "complete");
    expect(places.own).toEqual([chart, plain]);
    expect(places.byStep.get(0)).toEqual([sources]);
  });
});
