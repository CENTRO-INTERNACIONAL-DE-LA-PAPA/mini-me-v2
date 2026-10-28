import { describe, expect, it } from "vitest";
import { formatRelative } from "./format";

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
