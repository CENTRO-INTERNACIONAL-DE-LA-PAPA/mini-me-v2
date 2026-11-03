import { describe, expect, it } from "vitest";
import pkg from "../../package.json";
import { changelog, parseChangelog } from "./changelog";

describe("parseChangelog", () => {
  it("takes the version from the first line and the notes from the rest", () => {
    const parsed = parseChangelog("# Mini-Me 0.6.0\n\n## New\n\n- A thing.\n");
    expect(parsed).toEqual({ version: "0.6.0", body: "## New\n\n- A thing." });
  });

  it("keeps all the text when the first line names no version", () => {
    expect(parseChangelog("Notes\n\n- A thing.\n")).toEqual({
      version: null,
      body: "Notes\n\n- A thing.",
    });
  });
});

describe("the bundled changelog", () => {
  it("is for the version in package.json, so a release cannot ship the previous notes", () => {
    expect(changelog.version).toBe(pkg.version);
    expect(changelog.body).not.toBe("");
  });
});
