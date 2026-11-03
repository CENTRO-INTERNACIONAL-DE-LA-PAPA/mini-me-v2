// Prepares a release from `dev`, in one run. The version is the one in CHANGELOG.md's first line,
// `# Mini-Me 0.6.0`, so write the changelog first, leave it uncommitted, and run:
//
//   npm run release [-- --dry-run]
//
// It sets the version in package.json and package-lock.json, commits `chore(release): <version>`
// to `dev`, pushes `dev` and opens (or updates) the pull request from `dev` into `main`, with the
// changelog as its body. It never merges, tags or publishes: merging the pull request makes the
// Release workflow tag the commit and build the draft release. If a step fails, run it again: the
// steps already done are skipped. `--dry-run` says what it would do and changes nothing.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { checkRelease, latestVersion, releaseVersion } from "./release-lib.mjs";

const dryRun = process.argv.includes("--dry-run");
const root = new URL("..", import.meta.url);

function fail(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

/** Runs a program in the repository and returns its output, without the final newline. */
function run(program, args, input) {
  try {
    const stdio = ["pipe", "pipe", "pipe"];
    return execFileSync(program, args, { cwd: root, encoding: "utf8", input, stdio }).replace(/\n$/, "");
  } catch (error) {
    const said = `${error.stderr ?? ""}${error.stdout ?? ""}`.trim() || error.message;
    return fail(`\`${program} ${args.join(" ")}\` failed: ${said}`);
  }
}

/** Does `action`, or, in a dry run, only says that it would. */
function step(description, action) {
  console.log(`${dryRun ? "Would: " : ""}${description}`);
  if (!dryRun) action();
}

const read = (path) => readFileSync(new URL(path, root), "utf8");

// 1. What would be released, and whether this is the place and time to do it.
const changelog = read("CHANGELOG.md");
const tags = run("git", ["tag", "--list"]).split("\n").filter(Boolean);
const found = releaseVersion(changelog, latestVersion(tags));
if (found.problem) fail(found.problem);
const { version } = found;
if (tags.includes(`v${version}`)) fail(`v${version} is already tagged.`);

const branch = run("git", ["branch", "--show-current"]);
if (branch !== "dev") fail(`releases are prepared on dev, and ${branch || "no branch"} is checked out.`);
run("git", ["fetch", "--quiet", "origin", "dev"]);
if (Number(run("git", ["rev-list", "--count", "HEAD..origin/dev"])) > 0) {
  fail("dev is behind origin/dev. Pull it first.");
}

// Only the changelog may be changed; after an interrupted run, so may the version files, but only
// when they already hold this version.
const packageVersion = JSON.parse(read("package.json")).version;
const changed = run("git", ["status", "--porcelain"]).split("\n").filter(Boolean).map((line) => line.slice(3));
const versionFiles = ["package.json", "package-lock.json"];
const unexpected = changed.filter(
  (file) => file !== "CHANGELOG.md" && !(versionFiles.includes(file) && packageVersion === version),
);
if (unexpected.length > 0) fail(`these files have other changes: ${unexpected.join(", ")}. Commit or stash them first.`);

// 2. The version.
if (packageVersion !== version) {
  step(`set the version to ${version} in package.json and package-lock.json`, () =>
    run("npm", ["version", version, "--no-git-tag-version"]),
  );
}

// 3. The same checks CI runs. A dry run has not set the version, so it checks everything else.
if (!dryRun) {
  const problems = checkRelease({
    packageJson: JSON.parse(read("package.json")),
    lock: JSON.parse(read("package-lock.json")),
    tauriConf: JSON.parse(read("src-tauri/tauri.conf.json")),
    changelog: read("CHANGELOG.md"),
  });
  if (problems.length > 0) fail(problems.join("\n"));
}

// 4. The commit, the push and the pull request, each only if not already done.
const message = `chore(release): ${version}`;
const pending = run("git", ["status", "--porcelain", "--", "CHANGELOG.md", ...versionFiles]);
if (pending || dryRun) {
  step(`commit "${message}" with CHANGELOG.md, package.json and package-lock.json`, () => {
    run("git", ["add", "CHANGELOG.md", ...versionFiles]);
    run("git", ["commit", "--quiet", "-m", message]);
  });
}
const unpushed = Number(run("git", ["rev-list", "--count", "origin/dev..HEAD"])) > 0;
if (unpushed || pending || dryRun) {
  step("push dev to origin", () => run("git", ["push", "--quiet", "origin", "dev"]));
}

// The notes are the changelog without its title, which the pull request's own title already says.
const notes = changelog.split(/\r?\n/).slice(1).join("\n").replace(/^\s+/, "");
const open = JSON.parse(run("gh", ["pr", "list", "--base", "main", "--head", "dev", "--state", "open", "--json", "number,url"]));
if (open.length > 0) {
  step(`update the pull request ${open[0].url}`, () => {
    run("gh", ["pr", "edit", String(open[0].number), "--title", message, "--body-file", "-"], notes);
    console.log(open[0].url);
  });
} else {
  step("open the pull request from dev into main", () => {
    console.log(
      run("gh", ["pr", "create", "--base", "main", "--head", "dev", "--title", message, "--body-file", "-"], notes),
    );
  });
}
if (!dryRun) {
  console.log(`\nMerge the pull request to release ${version}: the Release workflow then tags and builds it.`);
}
