import type { Overview, OverviewOutput } from "../../protocol/types";
import { formatRelative } from "../../lib/format";

/** How many outputs the Overview shows before "Show all". */
export const LATEST_SHOWN = 6;

/** A past moment as `formatRelative` gives it, for use inside a sentence: "Just now" and
 * "Yesterday" lose their capital, dates keep theirs. */
export function relativeInSentence(time: number, now: number = Date.now()): string {
  const when = formatRelative(time, now);
  return when === "Just now" || when === "Yesterday" ? when.toLowerCase() : when;
}

/** The line above the Project's name: when it was last active and how many Conversations it
 * has. Times are in milliseconds. */
export function headerLine(overview: Overview, now: number = Date.now()): string {
  if (overview.conversations === 0 || overview.last_activity_at === null) {
    return "Overview · no conversations yet";
  }
  const updated = relativeInSentence(overview.last_activity_at, now);
  const n = overview.conversations;
  const count = n === 1 ? "1 conversation" : `${n} conversations`;
  return `Overview · updated ${updated} · ${count}`;
}

/** The outputs shown: the first `LATEST_SHOWN`, or every one once the user asks for all. */
export function shownOutputs(outputs: OverviewOutput[], all: boolean): OverviewOutput[] {
  return all ? outputs : outputs.slice(0, LATEST_SHOWN);
}
