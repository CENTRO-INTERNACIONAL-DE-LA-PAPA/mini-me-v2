import { describe, expect, it } from "vitest";
import {
  isLicenseFile,
  metadataHeaders,
  pythonPackage,
  repositoryUrl,
  shippedCrates,
  thirdParty,
} from "./third-party-lib.mjs";

describe("isLicenseFile", () => {
  it("takes license and notice files, and nothing else", () => {
    for (const name of ["LICENSE", "LICENSE-MIT", "licence.txt", "COPYING", "NOTICE.md"]) {
      expect(isLicenseFile(name)).toBe(true);
    }
    expect(isLicenseFile("README.md")).toBe(false);
  });
});

describe("repositoryUrl", () => {
  it("turns npm's repository forms into web addresses", () => {
    expect(repositoryUrl("github:remarkjs/react-markdown")).toBe(
      "https://github.com/remarkjs/react-markdown",
    );
    expect(repositoryUrl({ url: "git+https://github.com/facebook/react.git" })).toBe(
      "https://github.com/facebook/react",
    );
    expect(repositoryUrl(undefined)).toBeNull();
  });
});

describe("pythonPackage", () => {
  it("takes the license expression and the repository", () => {
    const headers = metadataHeaders(
      "Name: langsmith\nVersion: 0.14.8\nLicense-Expression: MIT\n" +
        "Project-URL: Homepage, https://smith.langchain.com/\n" +
        "Project-URL: Repository, https://github.com/langchain-ai/langsmith-sdk\n\nBody",
    );
    expect(pythonPackage(headers)).toEqual({
      name: "langsmith",
      version: "0.14.8",
      license: "MIT",
      repository: "https://github.com/langchain-ai/langsmith-sdk",
    });
  });

  it("takes the first line of a License field that holds the whole text, else a classifier", () => {
    const whole = metadataHeaders("Name: pandas\nLicense: BSD 3-Clause License\n         \n  Copyright");
    expect(pythonPackage(whole).license).toBe("BSD 3-Clause License");
    const classified = metadataHeaders(
      "Name: six\nLicense: UNKNOWN\nClassifier: License :: OSI Approved :: MIT License",
    );
    expect(pythonPackage(classified).license).toBe("MIT License");
  });
});

describe("shippedCrates", () => {
  it("keeps crates reached through normal dependencies only", () => {
    const pkg = (id) => ({ id, name: id });
    const dep = (id, kind) => ({ pkg: id, dep_kinds: [{ kind }] });
    const metadata = {
      packages: ["mini-me", "serde", "serde_derive", "cc", "tempfile"].map(pkg),
      resolve: {
        nodes: [
          { id: "mini-me", deps: [dep("serde", null), dep("cc", "build"), dep("tempfile", "dev")] },
          { id: "serde", deps: [dep("serde_derive", null)] },
        ],
      },
    };
    expect(shippedCrates(metadata, "mini-me").map((c) => c.name)).toEqual(["serde", "serde_derive"]);
  });
});

describe("thirdParty", () => {
  const component = (name, license, texts) => ({
    part: "core",
    name,
    version: "1.0.0",
    license,
    repository: null,
    texts,
  });

  it("keeps each text once and sorts components by part and name", () => {
    const file = thirdParty([
      component("serde", "MIT", ["MIT text"]),
      component("anyhow", "MIT", ["MIT text"]),
    ]);
    expect(file.texts).toEqual(["MIT text"]);
    expect(file.components.map((c) => [c.name, c.texts])).toEqual([
      ["anyhow", [0]],
      ["serde", [0]],
    ]);
  });

  it("fails naming the components that declare no license", () => {
    expect(() => thirdParty([component("mystery", null, [])])).toThrow("mystery 1.0.0");
  });
});
