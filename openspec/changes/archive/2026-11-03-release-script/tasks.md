# Tasks

## 1. One version, checked everywhere

- [x] 1.1 Add `scripts/release-lib.mjs` with a function that checks a set of file contents
  (`package.json`, `package-lock.json`, `tauri.conf.json`, `CHANGELOG.md`, and a tag when given) and
  returns the problems, and rewrite `scripts/check-version.mjs` to use it. Verify with Vitest tests
  in `scripts/release-lib.test.mjs`: agreement passes; a lock file with another version, a Tauri
  config that does not read `../package.json`, a changelog for another version and a wrong tag each
  give a problem naming both sides.
- [x] 1.2 Set `src-tauri/tauri.conf.json`'s version to `../package.json`, freeze `Cargo.toml`'s at
  `0.0.0` with a comment, and update `Cargo.lock` to match. Verify with `node scripts/check-version.mjs`,
  and a Rust unit test that the version the app is built with equals the one in `package.json`.
- [x] 1.3 Run `npm run check-version` in CI's frontend job. Verify by reading the workflow and
  running the command locally.

## 2. The release script

- [x] 2.1 In `release-lib.mjs`, add reading the version from a changelog's first line and comparing
  two versions. Verify with Vitest tests: a version read from `# Mini-Me 0.6.0`, a first line that
  names none refused, and comparisons including 0.10.0 above 0.9.0 and a version equal to or below
  the latest tag refused.
- [x] 2.2 Add `scripts/release.mjs` and an `npm run release` script that takes no argument: the
  checks (branch, `origin/dev`, working tree, the changelog's version), the version, the commit, the
  push and the pull request, each skipped when already done, and a `--dry-run` that changes nothing.
  Verify with `npm run release -- --dry-run` on a changelog for a new version, which prints every step,
  and with a refusal for each failed check; then a run in a throwaway clone with a local bare remote,
  which shows the commit and the push.

## 3. The release workflow and docs

- [x] 3.1 In `release.yml`, run on a push to `main` and on `workflow_dispatch`; first job: stop when
  `v<version>` exists, otherwise check, create the tag at the commit, and create the draft with the
  changelog as notes; build jobs run only with a release ID; add a `concurrency` group. Verify by
  reading it, by running the job's tag check against GitHub for `v0.5.2`, which must stop, and
  for a version with no tag, which must continue.
- [x] 3.2 Rewrite "Cutting a release" in `docs/development.md` for the new flow: write the changelog,
  run the command, merge the pull request, test and publish the draft, and recover a failed build or
  a deleted tag. Verify by reading it against the script's own messages.

## Workflow follow-up

- Run the Rust, frontend and sidecar tests; the first real release is the final check of the whole
  flow.
- Archive the change (`/opsx:archive`), syncing its delta spec into `openspec/specs/`.
- Open the pull request into `dev` with "Closes #115".
