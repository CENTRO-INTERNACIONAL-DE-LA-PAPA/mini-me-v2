import { describe, expect, it } from "vitest";
import { updateLabel } from "./updateLabel";

describe("updateLabel", () => {
  it("shows nothing without an update, and says when one is ready", () => {
    expect(updateLabel({ state: "none" })).toBeNull();
    expect(updateLabel({ state: "ready", version: "0.3.0" })).toBe("Mini-Me 0.3.0 is ready");
  });

  it("shows the download percent once the size is known", () => {
    const downloading = (percent: number | null) =>
      updateLabel({ state: "downloading", version: "0.3.0", percent });
    expect(downloading(42)).toBe("Downloading update 0.3.0 (42%)");
    expect(downloading(null)).toBe("Downloading update 0.3.0");
  });
});
