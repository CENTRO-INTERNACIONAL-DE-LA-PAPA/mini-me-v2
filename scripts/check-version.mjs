// Checks that everything a release depends on agrees on the app version, which package.json sets:
// package-lock.json carries it, the Tauri configuration reads it from package.json, and
// CHANGELOG.md is for it. With a tag such as `v0.2.0`, also that the tag is that version. Exits 1,
// naming each disagreement, when anything does not agree.
//
//   node scripts/check-version.mjs [tag]

import { readFileSync } from "node:fs";
import { checkRelease } from "./release-lib.mjs";

const repo = new URL("..", import.meta.url);
const read = (path) => readFileSync(new URL(path, repo), "utf8");

const packageJson = JSON.parse(read("package.json"));
const problems = checkRelease({
  packageJson,
  lock: JSON.parse(read("package-lock.json")),
  tauriConf: JSON.parse(read("src-tauri/tauri.conf.json")),
  changelog: read("CHANGELOG.md"),
  tag: process.argv[2],
});

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log(`All versions are ${packageJson.version}.`);
