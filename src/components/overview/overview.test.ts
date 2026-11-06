import { describe, expect, it } from "vitest";
import type { Overview, OverviewOutput } from "../../protocol/types";
import { findNamed, headerLine, shownOutputs, summaryParts } from "./overview";

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
  it("says when the Project was last active", () => {
    const overview = { ...base, conversations: 3, last_activity_at: now - 2 * 3_600_000 };
    expect(headerLine(overview, now)).toBe("Updated 2 h ago");
    const yesterday = { ...base, conversations: 1, last_activity_at: now - 20 * 3_600_000 };
    expect(headerLine(yesterday, now)).toBe("Updated yesterday");
    const older = { ...base, conversations: 2, last_activity_at: new Date(2026, 2, 12).getTime() };
    expect(headerLine(older, now)).toBe("Updated Mar 12");
  });

  it("says so when there are no Conversations", () => {
    expect(headerLine(base, now)).toBe("No conversations yet");
  });
});

describe("shownOutputs", () => {
  it("shows six, then all", () => {
    const outputs = Array.from({ length: 8 }, (_, i) => ({ id: String(i) }) as OverviewOutput);
    expect(shownOutputs(outputs, false)).toHaveLength(6);
    expect(shownOutputs(outputs, true)).toHaveLength(8);
  });
});

describe("summaryParts", () => {
  it("splits a summary into its text and its names", () => {
    expect(summaryParts("Cleaned [trial.csv]() and drew [Yield by variety]().")).toEqual([
      { text: "Cleaned " },
      { text: "trial.csv", named: true },
      { text: " and drew " },
      { text: "Yield by variety", named: true },
      { text: "." },
    ]);
  });

  it("leaves a summary without names, and real links, as text", () => {
    expect(summaryParts("See [CIP](https://cip.org).")).toEqual([
      { text: "See [CIP](https://cip.org)." },
    ]);
  });
});

describe("findNamed", () => {
  const file = { id: "f1", name: "trial.csv", media_type: "text/csv", size_bytes: 1 };
  const chart = { kind: "chart", id: "c1", title: "Yield by variety" } as OverviewOutput;

  it("finds a file, then a table or chart, by the name references give it", () => {
    expect(findNamed("trial.csv", [file], [chart])).toEqual({ file });
    expect(findNamed("$Yield-by-variety", [file], [chart])).toEqual({ component: chart });
    expect(findNamed("yield by variety", [file], [chart])).toEqual({ component: chart });
  });

  it("finds nothing for a name the Project does not have", () => {
    expect(findNamed("old.csv", [file], [chart])).toBeUndefined();
  });
});
