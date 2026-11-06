import type { AssetRef, Overview, OverviewOutput } from "../../protocol/types";
import { formatRelative } from "../../lib/format";

/** How many outputs the Overview shows before "Show all". */
export const LATEST_SHOWN = 6;

/** A past moment as `formatRelative` gives it, for use inside a sentence: "Just now" and
 * "Yesterday" lose their capital, dates keep theirs. */
export function relativeInSentence(time: number, now: number = Date.now()): string {
  const when = formatRelative(time, now);
  return when === "Just now" || when === "Yesterday" ? when.toLowerCase() : when;
}

/** The line above the Project's name: when it was last active. Times are in milliseconds. */
export function headerLine(overview: Overview, now: number = Date.now()): string {
  if (overview.conversations === 0 || overview.last_activity_at === null) {
    return "No conversations yet";
  }
  return `Updated ${relativeInSentence(overview.last_activity_at, now)}`;
}

/** The outputs shown: the first `LATEST_SHOWN`, or every one once the user asks for all. */
export function shownOutputs(outputs: OverviewOutput[], all: boolean): OverviewOutput[] {
  return all ? outputs : outputs.slice(0, LATEST_SHOWN);
}

/** A piece of a summary: text, or the name of a file, table or chart the model wrote as
 * `[name]()`. */
export type SummaryPart = { text: string; named?: boolean };

const NAMED = /\[([^\]]+)\]\(\)/g;

/** Splits a summary into its text and its `[name]()` names, in order. */
export function summaryParts(summary: string): SummaryPart[] {
  const parts: SummaryPart[] = [];
  let at = 0;
  for (const match of summary.matchAll(NAMED)) {
    if (match.index > at) parts.push({ text: summary.slice(at, match.index) });
    parts.push({ text: match[1], named: true });
    at = match.index + match[0].length;
  }
  if (at < summary.length) parts.push({ text: summary.slice(at) });
  return parts;
}

/** A name as `$` references write it: other characters than letters, digits, `.`, `_` and `-`
 * become `-`, a run of `-` one, and case is ignored. */
const asReference = (name: string) =>
  name
    .replace(/^[#$]/, "")
    .replace(/[^\p{L}\p{N}._-]/gu, "-")
    .replace(/-{2,}/g, "-")
    .toLowerCase();

/** What a name in the summary refers to: the Project's file of that name, else the newest
 * table or chart output whose title gives that name; undefined when nothing has it. */
export function findNamed(
  name: string,
  files: AssetRef[],
  outputs: OverviewOutput[],
): { file: AssetRef } | { component: OverviewOutput } | undefined {
  const wanted = asReference(name);
  const file = files.find((f) => asReference(f.name) === wanted);
  if (file) return { file };
  const component = outputs.find(
    (o) => (o.kind === "table" || o.kind === "chart") && asReference(o.title) === wanted,
  );
  return component && { component };
}
