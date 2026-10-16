import { describe, expect, it } from "vitest";
import fixture from "../../src-tauri/fixtures/events.json";
import { applyEvent, emptyConversation, type ConversationState } from "./eventStore";
import type { ProtocolEvent } from "./types";

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
