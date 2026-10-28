import { describe, expect, it } from "vitest";
import { SUMMON, pressKey } from "./sequence";

const press = (keys: string[]) => {
  let recent: string[] = [];
  const matches: boolean[] = [];
  for (const key of keys) {
    const result = pressKey(recent, key);
    recent = result.recent;
    matches.push(result.matched);
  }
  return matches;
};

describe("pressKey", () => {
  it("matches the sequence on its last key", () => {
    expect(press(SUMMON)).toEqual([false, false, false, false, false, false, false, true]);
  });

  it("matches after other keys came first", () => {
    const matches = press(["a", "ArrowUp", ...SUMMON]);
    expect(matches[matches.length - 1]).toBe(true);
  });

  it("does not match a sequence with a wrong key in it", () => {
    const wrong = [...SUMMON];
    wrong[4] = "ArrowRight";
    expect(press(wrong)).not.toContain(true);
  });

  it("starts over after a match", () => {
    expect(press([...SUMMON, ...SUMMON.slice(0, 4)]).filter(Boolean)).toHaveLength(1);
  });
});
