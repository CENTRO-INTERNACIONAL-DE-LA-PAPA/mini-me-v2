import type { AssetRef, MiniMe, TextComponent } from "./types";

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
 * Replaces `text[start..end]` (the typed query) with the target's label followed by a space,
 * and records the reference.
 */
export function insertReference(
  text: string,
  references: DraftReference[],
  start: number,
  end: number,
  target: ReferenceTarget,
): { text: string; references: DraftReference[]; cursor: number } {
  const inserted = `${target.label} `;
  const nextText = text.slice(0, start) + inserted + text.slice(end);
  const shifted = updateReferences(text, nextText, references);
  const reference = { ...target, start, end: start + target.label.length };
  return {
    text: nextText,
    references: [...shifted, reference].sort((a, b) => a.start - b.start),
    cursor: start + inserted.length,
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
