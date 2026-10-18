import type {
  Author,
  ErrorInfo,
  JevAnswers,
  KnownEvent,
  Message,
  Progress,
  ProtocolEvent,
} from "./types";

export interface Reaction {
  emoji: string;
  by: Author;
}

export interface MessageView extends Message {
  reactions: Reaction[];
  /** The latest progress of a streaming reply; null once it has ended. */
  progress: Progress | null;
  /** Jev's raw answers about this message, when the developer setting stored them. */
  jev?: JevAnswers;
  /** Why the reply failed, once it has. */
  failure?: ErrorInfo;
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
        messages: [
          ...state.messages,
          {
            ...known.payload.message,
            // Events stored before Interactive Components existed have no `components`.
            components: known.payload.message.components ?? [],
            steps: known.payload.message.steps ?? [],
            reactions: [],
            progress: null,
          },
        ],
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
          failure: known.payload.error,
        })),
      };
    case "message.paused":
      return {
        ...next,
        messages: updateMessage(state, known.payload.message_id, (m) =>
          m.status === "streaming" ? { ...m, status: "paused", progress: null } : m,
        ),
      };
    case "message.resumed":
      return {
        ...next,
        messages: updateMessage(state, known.payload.message_id, (m) =>
          m.status === "paused" ? { ...m, status: "streaming" } : m,
        ),
      };
    case "step.started": {
      const { message_id, step_id, type, name } = known.payload;
      const step = { step_id, type, name, output: null, done: false };
      return {
        ...next,
        messages: updateMessage(state, message_id, (m) => ({ ...m, steps: [...m.steps, step] })),
      };
    }
    case "step.completed": {
      const { message_id, step_id, output } = known.payload;
      return {
        ...next,
        messages: updateMessage(state, message_id, (m) => {
          // A Step inside a loop starts once per iteration; the latest run is completed.
          const index = m.steps.map((s) => s.step_id).lastIndexOf(step_id);
          if (index < 0) return m;
          const steps = m.steps.map((s, i) => (i === index ? { ...s, output, done: true } : s));
          return { ...m, steps };
        }),
      };
    }
    case "component.answered": {
      const { message_id, component_id, answer } = known.payload;
      return {
        ...next,
        messages: updateMessage(state, message_id, (m) => ({
          ...m,
          components: m.components.map((c) =>
            c.id === component_id && c.answer == null ? { ...c, answer } : c,
          ),
        })),
      };
    }
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
    case "component.added": {
      const { message_id, component } = known.payload;
      return {
        ...next,
        messages: updateMessage(state, message_id, (m) => ({
          ...m,
          components: [...m.components, component],
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
    case "routing.answered": {
      const { message_id, answers, error } = known.payload;
      return {
        ...next,
        messages: updateMessage(state, message_id, (m) => ({ ...m, jev: { answers, error } })),
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
