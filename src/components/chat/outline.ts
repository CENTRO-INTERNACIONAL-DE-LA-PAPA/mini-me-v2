import type { MessageView } from "../../protocol/eventStore";
import type { ComponentName } from "../interactive/component-names";

/** Something a Conversation uses, with the messages it appears in, in order. */
export interface OutlineEntry {
  id: string;
  /** The name to show, without its `@`, `#` or `$`; empty for a Mini-Me known only as a
   * reply's author, whose name comes from the Mini-Me list. */
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

const unsigned = (label: string) => label.replace(/^[@#$]/, "");

/** The Mini-Mes, files and tables and charts `messages` use. `names` are the Conversation's
 * table and chart names, from `componentNames`. */
export function outline(messages: MessageView[], names: Map<string, ComponentName>): Outline {
  const miniMes = new Group();
  const files = new Group();
  const components = new Group();
  for (const message of messages) {
    if (message.author.kind === "mini_me") miniMes.add(message.author.id, "", message.id);
    for (const reference of message.text_components) {
      const group =
        reference.kind === "mini_me" ? miniMes : reference.kind === "asset" ? files : components;
      group.add(reference.id, unsigned(reference.label), message.id);
    }
    for (const asset of message.attachments) files.add(asset.id, asset.name, message.id);
    for (const component of message.components) {
      const name = names.get(component.id);
      if (name) components.add(component.id, name.name, message.id);
    }
  }
  return { miniMes: miniMes.list(), files: files.list(), components: components.list() };
}
