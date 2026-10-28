import type { JSONContent } from "@tiptap/core";
import type { AssetRef, MiniMe, MiniMeGroup, TextComponent } from "./types";

export type ReferenceKind = TextComponent["kind"];

/** What a reference points to: the Asset, Mini-Me or component `id`, labelled `label`. */
export type ReferenceTarget = Pick<TextComponent, "kind" | "id" | "label">;

export const assetTarget = (asset: AssetRef): ReferenceTarget => ({
  kind: "asset",
  id: asset.id,
  label: `#${asset.name}`,
});

export const miniMeTarget = (miniMe: MiniMe): ReferenceTarget => ({
  kind: "mini_me",
  id: miniMe.id,
  label: `@${miniMe.name}`,
});

/** A `$` reference to the table or chart `componentId`, which goes by `name`. */
export const componentTarget = (name: string, componentId: string): ReferenceTarget => ({
  kind: "component",
  id: componentId,
  label: `$${name}`,
});

/**
 * The composer's document as a message: its text with each reference's label in place, and a
 * Text Component over each label. Paragraphs and hard breaks become line breaks.
 */
export function draftFromDoc(doc: JSONContent): {
  content: string;
  text_components: TextComponent[];
} {
  let content = "";
  const text_components: TextComponent[] = [];
  (doc.content ?? []).forEach((block, index) => {
    if (index > 0) content += "\n";
    for (const node of block.content ?? []) {
      if (node.type === "text") {
        content += node.text ?? "";
      } else if (node.type === "hardBreak") {
        content += "\n";
      } else if (node.type === "reference") {
        const { kind, id, label } = node.attrs as ReferenceTarget;
        const start = content.length;
        content += label;
        text_components.push({ kind, id, label, start, end: content.length });
      }
    }
  });
  return { content, text_components };
}

/**
 * The content as Markdown source in which each Text Component reads `[label](ref:N)`, `N`
 * being its index in `components`, so a Markdown renderer can draw it as a chip. A component
 * whose range doesn't hold its label is left as plain text.
 */
export function markdownSource(content: string, components: TextComponent[]): string {
  const escape = (label: string) => label.replace(/[\\[\]]/g, "\\$&");
  return components
    .map((component, index) => ({ component, index }))
    .filter(({ component }) => content.slice(component.start, component.end) === component.label)
    .sort((a, b) => b.component.start - a.component.start)
    .reduce((source, { component, index }) => {
      let before = source.slice(0, component.start);
      // A `!` right before the link would make it an image; escaped, it stays a `!`.
      if (before.endsWith("!") && !before.endsWith("\\!")) {
        before = `${before.slice(0, -1)}\\!`;
      }
      return `${before}[${escape(component.label)}](ref:${index})${source.slice(component.end)}`;
    }, content);
}

export const MINI_ME_GROUPS: Array<{ group: MiniMeGroup; label: string }> = [
  { group: "thinking", label: "Thinking" },
  { group: "literature", label: "Literature" },
  { group: "data", label: "Data" },
];

/** Lowercased, without accents, for matching what the user types against names. */
export const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * The Mini-Mes whose name contains `query`, ignoring case and accents, grouped in the order
 * of `MINI_ME_GROUPS` and in their library order within a group. Empty groups are left out.
 */
export function miniMeSuggestions(
  miniMes: MiniMe[],
  query: string,
): Array<{ label: string; miniMes: MiniMe[] }> {
  const matching = miniMes.filter((m) => fold(m.name).includes(fold(query)));
  return MINI_ME_GROUPS.map(({ group, label }) => ({
    label,
    miniMes: matching.filter((m) => m.group === group),
  })).filter((section) => section.miniMes.length > 0);
}

/** Splits content into plain text and reference segments, for rendering chips. */
export function segments(
  content: string,
  components: TextComponent[],
): Array<{ text: string; component?: TextComponent }> {
  const result: Array<{ text: string; component?: TextComponent }> = [];
  let position = 0;
  for (const component of [...components].sort((a, b) => a.start - b.start)) {
    if (component.start < position) {
      continue;
    }
    if (component.start > position) {
      result.push({ text: content.slice(position, component.start) });
    }
    result.push({ text: content.slice(component.start, component.end), component });
    position = component.end;
  }
  if (position < content.length) {
    result.push({ text: content.slice(position) });
  }
  return result;
}
