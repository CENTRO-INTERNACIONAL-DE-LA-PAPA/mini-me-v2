import type { MessageView } from "../../protocol/eventStore";

/** A table or chart of a Conversation by the name its `$` references use. */
export interface ComponentName {
  id: string;
  name: string;
  kind: "table" | "chart";
}

const TABLE_EXTENSION = /\.(csv|tsv|xlsx)$/i;

/** The name before numbering repeats: a table's file or title, a chart's title, else the kind. */
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

/** Each table and chart's name by component ID; later repeats get "-2", "-3" and so on. */
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
