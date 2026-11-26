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

  it("flags each place whose version disagrees with package.json", () => {
    const disagreeing = [
      { lock: { version: "0.5.2", packages: { "": { version: "0.6.0" } } } },
      { lock: { version: "0.6.0", packages: { "": { version: "0.5.2" } } } },
      { tauriConf: { version: "0.6.0" } },
      { changelog: "# Mini-Me 0.5.2\n" },
      { changelog: "Notes\n" },
      { tag: "v0.7.0" },
    ];
    for (const change of disagreeing) {
      expect(checkRelease({ ...agreeing(), ...change }), JSON.stringify(change)).toHaveLength(1);
    }
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
