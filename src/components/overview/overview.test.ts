import { describe, expect, it } from "vitest";
import type { Overview, OverviewOutput } from "../../protocol/types";
import { headerLine, shownOutputs } from "./overview";

const now = new Date(2026, 9, 21, 15, 0).getTime();
const base: Overview = {
  conversations: 0,
  last_activity_at: null,
  summary: null,
  summary_at: null,
  featured: null,
  outputs: [],
};

describe("headerLine", () => {
  it("says when the Project was last active and how many Conversations it has", () => {
    const overview = { ...base, conversations: 3, last_activity_at: now - 2 * 3_600_000 };
    expect(headerLine(overview, now)).toBe("Overview · updated 2 h ago · 3 conversations");
    const yesterday = { ...base, conversations: 1, last_activity_at: now - 20 * 3_600_000 };
    expect(headerLine(yesterday, now)).toBe("Overview · updated yesterday · 1 conversation");
    const older = { ...base, conversations: 2, last_activity_at: new Date(2026, 2, 12).getTime() };
    expect(headerLine(older, now)).toBe("Overview · updated Mar 12 · 2 conversations");
  });

  it("says so when there are no Conversations", () => {
    expect(headerLine(base, now)).toBe("Overview · no conversations yet");
  });
});

describe("shownOutputs", () => {
  it("shows six, then all", () => {
    const outputs = Array.from({ length: 8 }, (_, i) => ({ id: String(i) }) as OverviewOutput);
    expect(shownOutputs(outputs, false)).toHaveLength(6);
    expect(shownOutputs(outputs, true)).toHaveLength(8);
  });
});
