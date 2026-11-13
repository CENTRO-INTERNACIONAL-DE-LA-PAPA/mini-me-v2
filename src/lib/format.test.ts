import { describe, expect, it } from "vitest";
import { appLabel, count, formatRelative } from "./format";

describe("formatRelative", () => {
  const now = new Date(2026, 9, 21, 15, 0).getTime();
  const at = (...args: [number, number, number, number, number]) => new Date(...args).getTime();

  it("counts minutes and hours within the same day", () => {
    expect(formatRelative(now - 20_000, now)).toBe("Just now");
    expect(formatRelative(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(formatRelative(at(2026, 9, 21, 12, 30), now)).toBe("2 h ago");
  });

  it("names yesterday, then shows the date", () => {
    expect(formatRelative(at(2026, 9, 20, 23, 0), now)).toBe("Yesterday");
    expect(formatRelative(at(2026, 2, 12, 9, 0), now)).toBe("Mar 12");
    expect(formatRelative(at(2024, 2, 12, 9, 0), now)).toBe("Mar 12, 2024");
  });
});

describe("count", () => {
  it("names one thing in the singular and others in the plural", () => {
    expect(count(1, "file")).toBe("1 file");
    expect(count(0, "file")).toBe("0 files");
    expect(count(2, "person", "people")).toBe("2 people");
  });
});

describe("appLabel", () => {
  it("names Mini-Me by version and Mini-Me Canary by commit", () => {
    expect(appLabel("Mini-Me", "0.6.0")).toBe("Mini-Me 0.6.0");
    expect(appLabel("Mini-Me", "0.6.0", "a1b2c3d")).toBe("Mini-Me 0.6.0");
    expect(appLabel("Mini-Me Canary", "0.0.42", "a1b2c3d")).toBe("Mini-Me Canary a1b2c3d");
    expect(appLabel("Mini-Me Canary", "0.7.0")).toBe("Mini-Me Canary (local)");
  });
});
