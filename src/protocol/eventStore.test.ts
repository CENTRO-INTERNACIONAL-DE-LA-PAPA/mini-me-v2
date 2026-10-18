import { describe, expect, it } from "vitest";
import fixture from "../../src-tauri/fixtures/events.json";
import { applyEvent, emptyConversation, type ConversationState } from "./eventStore";
import type { Message, ProtocolEvent } from "./types";

const events = fixture as ProtocolEvent[];

function replay(list: ProtocolEvent[], from: ConversationState = emptyConversation) {
  return list.reduce(applyEvent, from);
}

function withSeq(event: ProtocolEvent, seq: number): ProtocolEvent {
  return { ...event, seq };
}

describe("applyEvent with the shared fixture", () => {
  const state = replay(events);
  const [question, answer, followUp, stopped, interrupted] = state.messages;

  it("applies every event in order", () => {
    expect(state.lastSeq).toBe(events.length);
    expect(state.messages).toHaveLength(5);
  });

  it("keeps attachments and text components of user messages", () => {
    expect(question.attachments[0].name).toBe("field-trial.csv");
    expect(question.text_components[0]).toMatchObject({ kind: "asset", start: 10, end: 26 });
  });

  it("streams deltas, attachments and completion into one reply", () => {
    expect(answer.status).toBe("complete");
    expect(answer.content).toBe("Summarize #field-trial.csv");
    expect(answer.attachments.map((a) => a.name)).toEqual(["summary.md"]);
  });

  it("adds a component to its reply, after the fixture's other events", () => {
    expect(interrupted.components).toHaveLength(1);
    expect(interrupted.components[0]).toMatchObject({ kind: "paper-sources", version: 1 });
    expect(answer.components).toEqual([]);
  });

  it("gives messages from events without components an empty list", () => {
    const created = events[0] as ProtocolEvent & { payload: { message: object } };
    const { components: _, ...message } = created.payload.message as { components?: unknown };
    const old = { ...created, payload: { message } };
    expect(replay([old]).messages[0].components).toEqual([]);
  });

  it("adds and removes reactions", () => {
    expect(answer.reactions).toEqual([]);
  });

  it("marks cancelled and failed replies", () => {
    expect(followUp.status).toBe("complete");
    expect(stopped.status).toBe("cancelled");
    expect(interrupted.status).toBe("failed");
  });

  it("keeps why a reply failed", () => {
    expect(interrupted.failure?.message).toBe("The app closed before this reply finished.");
    expect(followUp.failure).toBeUndefined();
  });
});

describe("applyEvent ordering", () => {
  it("ignores events already applied", () => {
    const state = replay(events.slice(0, 3));
    expect(applyEvent(state, events[1])).toBe(state);
  });

  it("ignores events after a gap", () => {
    const state = replay(events.slice(0, 2));
    expect(applyEvent(state, events[3])).toBe(state);
  });

  it("collects deltas in order", () => {
    const [created] = events.filter((e) => e.type === "message.created").slice(1, 2);
    const delta = (text: string, seq: number): ProtocolEvent => ({
      ...events[2],
      seq,
      payload: { message_id: (created.payload as { message: { id: string } }).message.id, text },
    });
    const state = replay([withSeq(created, 1), delta("Hel", 2), delta("lo", 3)]);
    expect(state.messages[0].content).toBe("Hello");
    expect(state.messages[0].status).toBe("streaming");
  });
});

describe("reply progress", () => {
  const progressAt = events.findIndex((e) => e.type === "message.progress");

  it("shows the latest progress while the reply streams", () => {
    const state = replay(events.slice(0, progressAt + 1));
    const reply = state.messages[state.messages.length - 1];
    expect(reply.status).toBe("streaming");
    expect(reply.progress).toEqual({ label: "Reading field-trial.csv", fraction: 0.5 });
    expect(reply.content).toBe("");
  });

  it("clears progress once the reply ends", () => {
    const state = replay(events);
    expect(state.messages.every((m) => m.progress === null)).toBe(true);
  });

  it("ignores progress for a reply that has ended", () => {
    const ended = replay(events);
    const late = { ...events[progressAt], seq: ended.lastSeq + 1 };
    const state = applyEvent(ended, late);
    expect(state.messages.every((m) => m.progress === null)).toBe(true);
  });
});

describe("forward compatibility", () => {
  it("skips unknown event types but records their sequence", () => {
    const unknown: ProtocolEvent = { ...events[0], type: "component.added", payload: {} };
    const state = applyEvent(emptyConversation, unknown);
    expect(state.lastSeq).toBe(1);
    expect(state.messages).toEqual([]);
  });

  it("ignores unknown payload fields", () => {
    const extra: ProtocolEvent = {
      ...events[0],
      payload: { ...(events[0].payload as object), future_field: true },
    };
    expect(applyEvent(emptyConversation, extra).messages).toHaveLength(1);
  });
});

describe("Workflow replies", () => {
  const reply = "0199d0a0-0000-7000-8000-000000000199";
  const created = events.find(
    (e) => e.type === "message.created" && (e.payload as { message: Message }).message.status === "streaming",
  )!;
  let seq = 0;
  const event = (type: string, payload: object): ProtocolEvent => ({
    ...events[0],
    seq: ++seq,
    type,
    payload: { message_id: reply, ...payload },
  });
  const start = (): ProtocolEvent => {
    seq = 1;
    const message = { ...(created.payload as { message: Message }).message, id: reply };
    return { ...created, seq: 1, payload: { message } };
  };

  it("completes the latest run of a Step that a loop repeats", () => {
    const state = replay([
      start(),
      event("step.started", { step_id: "refute", type: "trait", name: "Refute" }),
      event("step.completed", { step_id: "refute", output: "first" }),
      event("step.started", { step_id: "refute", type: "trait", name: "Refute" }),
      event("step.completed", { step_id: "refute", output: "second" }),
    ]);
    const steps = state.messages[0].steps;
    expect(steps.map((s) => [s.output, s.done])).toEqual([
      ["first", true],
      ["second", true],
    ]);
  });

  it("pauses and resumes a reply, keeping only the first answer to its approval", () => {
    const approval = {
      id: "0199d0a0-0000-7000-8000-000000000399",
      kind: "approval",
      version: 1,
      data: { step_id: "ask", prompt: "Go on?" },
      text: "Go on?",
      answer: null,
    };
    const paused = replay([
      start(),
      event("component.added", { component: approval }),
      event("message.paused", {}),
    ]);
    expect(paused.messages[0].status).toBe("paused");

    const resumed = replay(
      [
        event("component.answered", { component_id: approval.id, answer: { approved: true } }),
        event("component.answered", { component_id: approval.id, answer: { approved: false } }),
        event("message.resumed", {}),
      ],
      paused,
    );
    expect(resumed.messages[0].status).toBe("streaming");
    expect(resumed.messages[0].components[0].answer).toEqual({ approved: true });
  });
});
