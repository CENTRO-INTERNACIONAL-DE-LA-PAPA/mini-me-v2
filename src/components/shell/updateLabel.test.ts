import { describe, expect, it } from "vitest";
import { updateLabel } from "./updateLabel";

describe("updateLabel", () => {
  it("shows nothing without an update", () => {
    expect(updateLabel({ state: "none" })).toBeNull();
  });

  it("shows the download percent", () => {
    expect(updateLabel({ state: "downloading", version: "0.3.0", percent: 42 })).toBe(
      "Downloading update 0.3.0 · 42%",
    );
  });

  it("leaves out the percent while the size is unknown", () => {
    expect(updateLabel({ state: "downloading", version: "0.3.0", percent: null })).toBe(
      "Downloading update 0.3.0",
    );
  });

  it("says when the update is ready", () => {
    expect(updateLabel({ state: "ready", version: "0.3.0" })).toBe("Mini-Me 0.3.0 is ready");
  });
});
