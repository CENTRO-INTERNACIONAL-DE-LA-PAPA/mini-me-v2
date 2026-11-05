import { describe, expect, it } from "vitest";
import type { FileEntry, MiniMe } from "../../protocol/types";
import { fileDetail, sharedNames } from "./fileDetail";

const NOW = new Date(2026, 10, 2, 12, 0).getTime();
const file = (added_by: FileEntry["added_by"], minutesAgo: number) =>
  ({ name: "field-trial.csv", added_by, created_at: NOW - minutesAgo * 60_000 }) as FileEntry;
const curator = { id: "c1", name: "Curator" } as MiniMe;

describe("file detail", () => {
  it("says when a file was added, and which Mini-Me saved it", () => {
    expect(fileDetail(file({ kind: "user", id: "u" }, 120), [curator], NOW)).toBe("Added 2 h ago");
    expect(fileDetail(file({ kind: "mini_me", id: "c1" }, 5), [curator], NOW)).toBe(
      "Saved by Curator 5 min ago",
    );
    expect(fileDetail(file({ kind: "mini_me", id: "gone" }, 5), [curator], NOW)).toBe(
      "Added 5 min ago",
    );
    expect(fileDetail(file(null, 0), [], NOW)).toBe("Added Just now");
  });

  it("finds the names that more than one file has", () => {
    const names = [{ name: "a.csv" }, { name: "b.csv" }, { name: "a.csv" }];
    expect([...sharedNames(names)]).toEqual(["a.csv"]);
    expect(sharedNames([{ name: "a.csv" }, { name: "b.csv" }]).size).toBe(0);
  });
});
