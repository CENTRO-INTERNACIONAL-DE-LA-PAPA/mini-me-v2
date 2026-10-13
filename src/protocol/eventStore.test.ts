import { describe, expect, it } from "vitest";
import fixture from "../../protocol/fixtures/events.json";
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

  it("adds and removes reactions", () => {
    expect(answer.reactions).toEqual([]);
  });

  it("marks cancelled and failed replies", () => {
    expect(followUp.status).toBe("complete");
    expect(stopped.status).toBe("cancelled");
    expect(interrupted.status).toBe("failed");
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
