import type { AssetRef, MiniMe, MiniMeGroup, TextComponent } from "./types";

export type ReferenceKind = TextComponent["kind"];

/** A `#` file reference or an `@` Mini-Me mention inside the composer text. Offsets are
 * JavaScript string indices. */
export interface DraftReference {
  kind: ReferenceKind;
  id: string;
  label: string;
  start: number;
  end: number;
}

/** What a reference points to, before it has a position in the text. */
export type ReferenceTarget = Pick<DraftReference, "kind" | "id" | "label">;

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

/** The `#query` or `@query` being typed right before the cursor, if any. */
export function activeQuery(
  text: string,
  cursor: number,
): { start: number; query: string; kind: ReferenceKind } | null {
  const match = /(^|\s)([#@])([^\s#@]*)$/.exec(text.slice(0, cursor));
  if (!match) {
    return null;
  }
  const start = cursor - match[3].length - 1;
  return { start, query: match[3], kind: match[2] === "#" ? "asset" : "mini_me" };
}

/**
 * Replaces `text[start..end]` (the typed query) with the target's label and records the
 * reference. A space follows the label unless the text after it already starts with
 * whitespace; either way the cursor ends after that space.
 */
export function insertReference(
  text: string,
  references: DraftReference[],
  start: number,
  end: number,
  target: ReferenceTarget,
): { text: string; references: DraftReference[]; cursor: number } {
  const spaced = /^\s/.test(text.slice(end));
  const inserted = spaced ? target.label : `${target.label} `;
  const nextText = text.slice(0, start) + inserted + text.slice(end);
  const shifted = updateReferences(text, nextText, references);
  const reference = { ...target, start, end: start + target.label.length };
  return {
    text: nextText,
    references: [...shifted, reference].sort((a, b) => a.start - b.start),
    cursor: start + target.label.length + 1,
  };
}

/**
 * Keeps references in step with an edit from `before` to `after`. References entirely before
 * or after the edited region are kept (and shifted); any reference the edit touches is
 * dropped, leaving its text as plain text.
 */
export function updateReferences(
  before: string,
  after: string,
  references: DraftReference[],
): DraftReference[] {
  let prefix = 0;
  const maxPrefix = Math.min(before.length, after.length);
  while (prefix < maxPrefix && before[prefix] === after[prefix]) {
    prefix++;
  }
  let suffix = 0;
  const maxSuffix = Math.min(before.length, after.length) - prefix;
  while (
    suffix < maxSuffix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix++;
  }
  const editEnd = before.length - suffix;
  const delta = after.length - before.length;

  return references.flatMap((ref) => {
    if (ref.end <= prefix) {
      return [ref];
    }
    if (ref.start >= editEnd) {
      return [{ ...ref, start: ref.start + delta, end: ref.end + delta }];
    }
    return [];
  });
}

export function toTextComponents(references: DraftReference[]): TextComponent[] {
  return references.map(({ kind, id, label, start, end }): TextComponent => ({
    kind,
    id,
    label,
    start,
    end,
  }));
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
    .reduce(
      (source, { component, index }) =>
        `${source.slice(0, component.start)}[${escape(component.label)}](ref:${index})` +
        source.slice(component.end),
      content,
    );
}

export const MINI_ME_GROUPS: Array<{ group: MiniMeGroup; label: string }> = [
  { group: "thinking", label: "Thinking" },
  { group: "literature", label: "Literature" },
  { group: "data", label: "Data" },
];

/** Lowercased, without accents, for matching what the user types against names. */
const fold = (text: string) =>
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
