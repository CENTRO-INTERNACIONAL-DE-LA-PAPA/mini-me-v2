import type { MessageView } from "../../protocol/eventStore";

/** Something a Conversation uses, with the messages it appears in, in order. */
export interface OutlineEntry {
  id: string;
  /** The name to show, without its `@` or `#`; empty for a Mini-Me known only as a reply's
   * author, whose name comes from the Mini-Me list. */
  label: string;
  messageIds: string[];
}

export interface Outline {
  miniMes: OutlineEntry[];
  files: OutlineEntry[];
  components: OutlineEntry[];
}

/** Collects entries in order of first appearance, each message counted once. */
class Group {
  private entries = new Map<string, OutlineEntry>();

  add(id: string, label: string, messageId: string) {
    const entry = this.entries.get(id);
    if (!entry) {
      this.entries.set(id, { id, label, messageIds: [messageId] });
      return;
    }
    if (!entry.label) entry.label = label;
    if (entry.messageIds[entry.messageIds.length - 1] !== messageId) {
      entry.messageIds.push(messageId);
    }
  }

  list(): OutlineEntry[] {
    return [...this.entries.values()];
  }
}

const unsigned = (label: string) => label.replace(/^[@#]/, "");

/** A table's or chart's name in the Outline: its title, else its source file's name, else its
 * kind. */
function componentLabel(component: MessageView["components"][number]): string {
  const { title, source } = (component.preview ?? {}) as { title?: unknown; source?: unknown };
  if (typeof title === "string" && title.trim()) return title;
  if (typeof source === "string" && source.trim()) return source;
  return component.kind === "chart" ? "Chart" : "Table";
}

/** The Mini-Mes, files, tables and charts `messages` use. */
export function outline(messages: MessageView[]): Outline {
  const miniMes = new Group();
  const files = new Group();
  const components = new Group();
  for (const message of messages) {
    if (message.author.kind === "mini_me") miniMes.add(message.author.id, "", message.id);
    for (const reference of message.text_components) {
      const group = reference.kind === "mini_me" ? miniMes : files;
      group.add(reference.id, unsigned(reference.label), message.id);
    }
    for (const asset of message.attachments) files.add(asset.id, asset.name, message.id);
    for (const component of message.components) {
      if (component.kind === "table" || component.kind === "chart") {
        components.add(component.id, componentLabel(component), message.id);
      }
    }
  }
  return { miniMes: miniMes.list(), files: files.list(), components: components.list() };
}
