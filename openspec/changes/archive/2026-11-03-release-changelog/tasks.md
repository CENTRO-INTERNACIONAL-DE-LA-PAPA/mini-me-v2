# Tasks

## 1. The changelog and the release notes

- [x] 1.1 Write `CHANGELOG.md` for 0.5.2 from the `feat` and `fix` commits since v0.5.1, in plain
  language, under "New", "Improved" and "Fixed", for the user to edit. Verify by reading it and
  checking its first line is `# Mini-Me 0.5.2`.
- [x] 1.2 In `scripts/check-version.mjs`, when a tag is given, also fail if `CHANGELOG.md`'s first
  heading is not `# Mini-Me <tag version>`. Verify with `node scripts/check-version.mjs v0.5.2`
  passing and `v0.5.3` failing with a message that names both versions.
- [x] 1.3 In `release.yml`, create the draft with the changelog, without its first line, as its
  notes. Verify by reading the workflow, and by running its note-building command locally against
  `CHANGELOG.md`.
- [x] 1.4 Describe the changelog step in `docs/development.md` under "Cutting a release". Verify
  by reading it.

## 2. Remembering what was shown (Rust core)

- [x] 2.1 Add `last_seen_version` to `Settings`; `load_or_create` takes the running version and a
  new settings file records it. Add a function that tells whether to show What's new and records
  the version, false for Mini-Me Dev. Verify with Rust unit tests: a new file does not show,
  settings without a version show once, the same version does not show again, a different version
  shows once, and Mini-Me Dev never shows.
- [x] 2.2 Add the `take_whats_new` command, using the core's own version and the Mini-Me Dev flag,
  and `takeWhatsNew` in `api.ts`. Verify with `cargo test` and `npx tsc --noEmit`.

## 3. Showing it (UI)

- [x] 3.1 Add `src/lib/changelog.ts`, which imports `CHANGELOG.md?raw` and splits the heading
  version from the body. Verify with a frontend test of the splitting, and one that the bundled
  heading names the version in `package.json`.
- [x] 3.2 Add the `whats-new` view and its page: the version, the body in the Markdown component,
  and a close button that returns to the previous view. Verify by opening it from About in the app.
- [x] 3.3 In `App.tsx`, call `takeWhatsNew` once at start and open the page when it says so; in
  About, add the "What's new" button next to the version. Verify in the app: start with an older
  `last_seen_version` in `settings.json` and see the page once, then again from the button.
- [x] 3.4 Describe the page and the About button in `DESIGN.md`. Verify by reading it.

## Workflow follow-up

- Run the Rust, frontend and sidecar tests, and have the user verify the page in the app.
- Archive the change (`/opsx:archive`), syncing its delta specs into `openspec/specs/`.
- Open the pull request into `dev` with "Closes #100".
