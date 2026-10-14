import type { Author, KnownEvent, Message, Progress, ProtocolEvent } from "./types";

export interface Reaction {
  emoji: string;
  by: Author;
}

export interface MessageView extends Message {
  reactions: Reaction[];
  /** The latest progress of a streaming reply; null once it has ended. */
  progress: Progress | null;
}

export interface ConversationState {
  lastSeq: number;
  messages: MessageView[];
}

export const emptyConversation: ConversationState = { lastSeq: 0, messages: [] };

function updateMessage(
  state: ConversationState,
  id: string,
  update: (message: MessageView) => MessageView,
): MessageView[] {
  return state.messages.map((message) => (message.id === id ? update(message) : message));
}

function sameAuthor(a: Author, b: Author): boolean {
  return a.kind === b.kind && a.id === b.id;
}

/**
 * Folds one event into the Conversation state. Only the event right after `lastSeq` is
 * applied: replays and duplicate deliveries are ignored, and unknown event types only
 * advance `lastSeq`.
 */
export function applyEvent(state: ConversationState, event: ProtocolEvent): ConversationState {
  if (event.seq !== state.lastSeq + 1) {
    return state;
  }
  const next = { ...state, lastSeq: event.seq };
  const known = event as KnownEvent;

  switch (known.type) {
    case "message.created":
      return {
        ...next,
        messages: [...state.messages, { ...known.payload.message, reactions: [], progress: null }],
      };
    case "message.delta": {
      const { message_id, text } = known.payload;
      return {
        ...next,
        messages: updateMessage(state, message_id, (m) => ({ ...m, content: m.content + text })),
      };
    }
    case "message.progress": {
      const { message_id, label, fraction } = known.payload;
      return {
        ...next,
        messages: updateMessage(state, message_id, (m) =>
          m.status === "streaming" ? { ...m, progress: { label, fraction } } : m,
        ),
      };
    }
    case "message.completed": {
      const { message_id, content } = known.payload;
      return {
        ...next,
        messages: updateMessage(state, message_id, (m) => ({
          ...m,
          content,
          status: "complete",
          progress: null,
        })),
      };
    }
    case "message.failed":
      return {
        ...next,
        messages: updateMessage(state, known.payload.message_id, (m) => ({
          ...m,
          status: "failed",
          progress: null,
        })),
      };
    case "message.cancelled":
      return {
        ...next,
        messages: updateMessage(state, known.payload.message_id, (m) => ({
          ...m,
          status: "cancelled",
          progress: null,
        })),
      };
    case "attachment.added": {
      const { message_id, asset } = known.payload;
      return {
        ...next,
        messages: updateMessage(state, message_id, (m) => ({
          ...m,
          attachments: [...m.attachments, asset],
        })),
      };
    }
    case "reaction.added": {
      const { message_id, emoji, by } = known.payload;
      return {
        ...next,
        messages: updateMessage(state, message_id, (m) =>
          m.reactions.some((r) => r.emoji === emoji && sameAuthor(r.by, by))
            ? m
            : { ...m, reactions: [...m.reactions, { emoji, by }] },
        ),
      };
    }
    case "reaction.removed": {
      const { message_id, emoji, by } = known.payload;
      return {
        ...next,
        messages: updateMessage(state, message_id, (m) => ({
          ...m,
          reactions: m.reactions.filter((r) => !(r.emoji === emoji && sameAuthor(r.by, by))),
        })),
      };
    }
    default:
      return next;
  }
}

/** Holds one Conversation's state for React's `useSyncExternalStore`. */
export class ConversationStore {
  private state: ConversationState = emptyConversation;
  private listeners = new Set<() => void>();

  apply = (event: ProtocolEvent): void => {
    const next = applyEvent(this.state, event);
    if (next !== this.state) {
      this.state = next;
      this.listeners.forEach((listener) => listener());
    }
  };

  getSnapshot = (): ConversationState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}
