# Tasks

## 1. Workflows

- [x] 1.1 In `canary.yml`'s `draft` job, read the version from `package.json` at the commit,
  fail saying to bump the version on `dev` when `v<version>` exists, skip a commit a
  `v…-canary.…` tag points at, find the counter from the `v<version>-canary.` tags, delete
  only drafts tagged `v…-canary.…`, and create the draft tagged
  `v<version>-canary.<n>`, named "Mini-Me <version>-canary.<n>", with notes naming the commit;
  output the version and tag. Verify: the version, counter and skip steps, run locally with `gh`
  against the repository, give `0.7.0`, "released, bump" and "not built before" for the newest
  commit of `dev`.
- [x] 1.2 In the `build` job, set the app version to `<version>-canary.<n>` and drop
  `VITE_COMMIT`; in `publish`, use the new tag. Note in the bundle list that canary builds must
  not add MSI. Update the file's header comment. Verify: the workflow file reads correctly
  (`actionlint` if available).
- [x] 1.3 In `release.yml`, delete only drafts tagged `v…` without `-canary.`. Verify: the jq
  filter, run locally on a sample list, keeps `v0.8.1-canary.3` and selects `v0.8.0`.

## 2. App

- [x] 2.1 In `appLabel`, show "Mini-Me <version>" for a version with `-canary.`, and "Mini-Me
  Canary (local)" for Mini-Me Canary without one; drop the commit argument in `SettingsView.tsx`
  and `VITE_COMMIT` from the types if declared. Update `format.test.ts`. Verify: `npx tsc
  --noEmit` is clean and `npm test` passes.

## 3. Docs

- [x] 3.1 Update "Canary builds" in `docs/development.md` (names, the counter, the version on
  `dev`, no run number). Verify: the text matches the specs.

## 4. Check

- [x] 4.1 After the pull request is merged into `dev` and the version on `dev` is bumped (by the
  user): the first build is published as "Mini-Me <version>-canary.1", tagged
  `v<version>-canary.1`; an installed Mini-Me Canary updates to it; Settings → About shows that
  name; a second push builds `<version>-canary.2`. Before the bump, the run fails saying to
  bump. Verify: the user's check confirms it.

## Workflow follow-up

- Archive the change (`/opsx:archive`).
- Ask before opening the pull request into `dev` (closes #187).
