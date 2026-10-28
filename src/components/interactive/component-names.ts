import type { MessageView } from "../../protocol/eventStore";

/** A table or chart of a Conversation by the name its `$` references use. */
export interface ComponentName {
  id: string;
  name: string;
  kind: "table" | "chart";
}

const TABLE_EXTENSION = /\.(csv|tsv|xlsx)$/i;

/** The name a component goes by before repeats are numbered. A table takes its file's name
 * without the extension, else its title without a table extension, else "table"; a chart
 * takes its title, else "chart". */
function baseName(kind: ComponentName["kind"], data: { source?: unknown; title?: unknown }) {
  const title = typeof data.title === "string" ? data.title : "";
  const name =
    kind === "chart"
      ? title || "chart"
      : typeof data.source === "string" && data.source
        ? data.source.replace(/\.[^.]*$/, "")
        : title.replace(TABLE_EXTENSION, "") || "table";
  return name.replace(/[^\p{L}\p{N}._-]/gu, "-").replace(/-{2,}/g, "-");
}

/** The name of each `table` and `chart` component of a Conversation, by component ID, in the
 * order they were shown. A component whose name an earlier one already has takes it with
 * "-2", "-3" and so on. */
export function componentNames(messages: MessageView[]): Map<string, ComponentName> {
  const names = new Map<string, ComponentName>();
  const taken = new Set<string>();
  for (const message of messages) {
    for (const { id, kind, data } of message.components) {
      if (kind !== "table" && kind !== "chart") continue;
      const base = baseName(kind, (data ?? {}) as { source?: unknown; title?: unknown });
      let name = base;
      for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
      taken.add(name);
      names.set(id, { id, name, kind });
    }
  }
  return names;
}
