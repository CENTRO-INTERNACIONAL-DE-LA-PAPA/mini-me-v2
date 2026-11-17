// The parts of preparing and checking a release that need no git, npm or network, so they can be
// tested. `sync-version.mjs` and `check-version.mjs` use them.

/** The path the Tauri configuration reads the app version from. */
export const TAURI_VERSION_SOURCE = "../package.json";

const CHANGELOG_HEADING = /^# Mini-Me (\d+\.\d+\.\d+)\s*$/;

/** The version a changelog's first line names, as in `# Mini-Me 0.6.0`, or null when it names none. */
export function changelogVersion(changelog) {
  const first = changelog.split(/\r?\n/, 1)[0];
  return first.match(CHANGELOG_HEADING)?.[1] ?? null;
}

/**
 * What stops a release of the app version in `packageJson`, as a list of sentences that name both
 * sides of each disagreement; empty when everything agrees. `lock` and `packageJson` are parsed
 * JSON, `tauriConf` is the parsed Tauri configuration, `changelog` is CHANGELOG.md's text, and `tag`,
 * when given, is a release tag such as `v0.6.0`.
 */
export function checkRelease({ packageJson, lock, tauriConf, changelog, tag }) {
  const version = packageJson.version;
  const problems = [];
  const lockVersions = {
    "package-lock.json": lock.version,
    "package-lock.json (packages)": lock.packages?.[""]?.version,
  };
  for (const [file, found] of Object.entries(lockVersions)) {
    if (found !== version) {
      problems.push(`${file} says ${found ?? "no version"} but package.json says ${version}.`);
    }
  }
  if (tauriConf.version !== TAURI_VERSION_SOURCE) {
    problems.push(
      `src-tauri/tauri.conf.json says ${JSON.stringify(tauriConf.version)} but must take the ` +
        `version from package.json (${JSON.stringify(TAURI_VERSION_SOURCE)}).`,
    );
  }
  const noted = changelogVersion(changelog);
  if (noted !== version) {
    problems.push(
      noted === null
        ? `CHANGELOG.md must start with "# Mini-Me ${version}", but its first line is something else.`
        : `CHANGELOG.md is for ${noted} but package.json says ${version}.`,
    );
  }
  if (tag !== undefined && tag.replace(/^v/, "") !== version) {
    problems.push(`The tag is ${tag} but package.json says ${version}.`);
  }
  return problems;
}
