import type { AssetRef, TextComponent } from "./types";

/** A `#` reference inside the composer text. Offsets are JavaScript string indices. */
export interface DraftReference {
  id: string;
  label: string;
  start: number;
  end: number;
}

/** The `#query` being typed right before the cursor, if any. */
export function activeQuery(text: string, cursor: number): { start: number; query: string } | null {
  const match = /(^|\s)#([^\s#]*)$/.exec(text.slice(0, cursor));
  if (!match) {
    return null;
  }
  const start = cursor - match[2].length - 1;
  return { start, query: match[2] };
}

/**
 * Replaces `text[start..end]` (the typed `#query`) with the Asset's label followed by a space,
 * and records the reference.
 */
export function insertReference(
  text: string,
  references: DraftReference[],
  start: number,
  end: number,
  asset: AssetRef,
): { text: string; references: DraftReference[]; cursor: number } {
  const label = `#${asset.name}`;
  const inserted = `${label} `;
  const nextText = text.slice(0, start) + inserted + text.slice(end);
  const shifted = updateReferences(text, nextText, references);
  const reference = { id: asset.id, label, start, end: start + label.length };
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
  return references.map((ref): TextComponent => ({ kind: "asset", ...ref }));
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
