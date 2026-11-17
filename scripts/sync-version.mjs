// Copies the version in CHANGELOG.md's first line, `# Mini-Me 0.6.0`, into package.json and
// package-lock.json. It commits nothing.
//
//   npm run sync-version

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { changelogVersion } from "./release-lib.mjs";

const root = new URL("..", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const version = changelogVersion(read("CHANGELOG.md"));
if (version === null) {
  console.error('CHANGELOG.md must start with "# Mini-Me <version>", such as "# Mini-Me 0.6.0".');
  process.exit(1);
}

const current = [JSON.parse(read("package.json")).version, JSON.parse(read("package-lock.json")).version];
if (current.every((found) => found === version)) {
  console.log(`package.json and package-lock.json already say ${version}.`);
} else {
  // Through a shell, because npm is a .cmd file on Windows; `version` is only digits and dots.
  execSync(`npm version ${version} --no-git-tag-version --allow-same-version`, { cwd: root, stdio: "ignore" });
  console.log(`Set the version to ${version} in package.json and package-lock.json.`);
}
