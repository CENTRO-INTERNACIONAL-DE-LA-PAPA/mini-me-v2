import { describe, expect, it } from "vitest";
import {
  changelogVersion,
  checkRelease,
  TAURI_VERSION_SOURCE,
} from "./release-lib.mjs";

const agreeing = () => ({
  packageJson: { version: "0.6.0" },
  lock: { version: "0.6.0", packages: { "": { version: "0.6.0" } } },
  tauriConf: { version: TAURI_VERSION_SOURCE },
  changelog: "# Mini-Me 0.6.0\n\n## New\n\n- A thing.\n",
});

describe("checkRelease", () => {
  it("finds nothing when everything agrees, with or without the tag", () => {
    expect(checkRelease(agreeing())).toEqual([]);
    expect(checkRelease({ ...agreeing(), tag: "v0.6.0" })).toEqual([]);
  });

  it("names both sides when a lock file has another version", () => {
    const lock = { version: "0.5.2", packages: { "": { version: "0.6.0" } } };
    expect(checkRelease({ ...agreeing(), lock })).toEqual([
      "package-lock.json says 0.5.2 but package.json says 0.6.0.",
    ]);
    const packages = { version: "0.6.0", packages: { "": { version: "0.5.2" } } };
    expect(checkRelease({ ...agreeing(), lock: packages })).toEqual([
      "package-lock.json (packages) says 0.5.2 but package.json says 0.6.0.",
    ]);
  });

  it("wants the Tauri configuration to read the version from package.json", () => {
    const problems = checkRelease({ ...agreeing(), tauriConf: { version: "0.6.0" } });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('"0.6.0"');
    expect(problems[0]).toContain(TAURI_VERSION_SOURCE);
  });

  it("names both versions when the changelog is for another one", () => {
    const changelog = "# Mini-Me 0.5.2\n";
    expect(checkRelease({ ...agreeing(), changelog })).toEqual([
      "CHANGELOG.md is for 0.5.2 but package.json says 0.6.0.",
    ]);
  });

  it("says what the changelog's first line must be when it names no version", () => {
    const [problem] = checkRelease({ ...agreeing(), changelog: "Notes\n" });
    expect(problem).toContain('"# Mini-Me 0.6.0"');
  });

  it("names both versions when the tag is another one", () => {
    expect(checkRelease({ ...agreeing(), tag: "v0.7.0" })).toEqual([
      "The tag is v0.7.0 but package.json says 0.6.0.",
    ]);
  });
});

describe("changelogVersion", () => {
  it("reads the version from the first line only", () => {
    expect(changelogVersion("# Mini-Me 0.6.0\n\n## New\n")).toBe("0.6.0");
    expect(changelogVersion("# Mini-Me 0.6.0\r\n")).toBe("0.6.0");
    expect(changelogVersion("Intro\n# Mini-Me 0.6.0\n")).toBeNull();
    expect(changelogVersion("# Mini-Me next\n")).toBeNull();
    expect(changelogVersion("")).toBeNull();
  });
});
