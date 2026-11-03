# Design

## Context

Releases are built by `.github/workflows/release.yml` from a version tag. Its `draft` job runs
`scripts/check-version.mjs` against the tag, then creates the draft release with no notes. The
version is read by the app through Tauri (`getVersion()` in About), and settings live in the core's
`settings.json` in the app config folder. `AppState` knows whether the running app is Mini-Me Dev
(`dev_app`). The UI has a `View` union for the main area, a Markdown component, and Settings'
About page.

Release #115, decided separately, will make a script write the version and a draft of the
changelog and move the tag to a merge into `main`. This change defines the file that script
writes and what reads it; it does not depend on that script, and works with a hand-written file.
See proposal.md for scope and the specs for behaviour.

## Goals / Non-Goals

**Goals:**
- One `CHANGELOG.md` that the GitHub Release and the app both show, so they never differ.
- A release cannot ship with a changelog for another version.
- What's new appears once per update, works offline, and never on a fresh install or in Dev.

**Non-Goals:**
- Any history of older versions, a feed from the network, or per-feature tours.
- Touching how the version is stored in the app's files (#115).

## Decisions

**One file, current release only.** `CHANGELOG.md` starts `# Mini-Me <version>` and has "New",
"Improved" and "Fixed" sections, left out when empty. Replacing the whole file each release keeps
it the same text everywhere and means nothing old can be shown by mistake. *Alternative:* a
growing file with a section per version: rejected, as the user wants only the current release and
the app would have to cut the right section out.

**The release workflow publishes the file, and checks it.** `check-version.mjs`, when given a tag,
also checks the changelog's heading against it, so the existing step in the `draft` job fails the
build before anything is created. The draft's body is the file without its first heading line,
since GitHub already shows "Mini-Me <version>" as the release's title. *Alternative:* a separate
check step: rejected, one script already owns "does this tag match".

**The app bundles the text through Vite.** `src/lib/changelog.ts` imports `CHANGELOG.md?raw`, so
the text is part of the frontend build, with no file to find at run time and no new dependency or
Tauri resource. The same module splits the heading from the body. A frontend test checks that the
bundled heading names `package.json`'s version, so a pull request that bumps the version without
the changelog fails CI. *Alternative:* a Tauri resource file read by the core: rejected, it adds
a path to resolve on three platforms for no gain.

**The core decides when What's new shows.** `settings.json` gains `last_seen_version`. A command,
`take_whats_new`, returns whether to open the page and records the running version as shown in the
same step, so it opens once even if the app is closed without dismissing it. It returns false in
Mini-Me Dev. A fresh install has no settings file: `load_or_create` creates one that already holds
the running version, so it does not open. A settings file from before this field existed holds no
version and is therefore treated as updated, which shows the first What's new to everyone who
updates into this feature. The running version is the core's own (`package_info`), not something
the UI sends. *Alternative:* the UI keeps the last version in local storage: rejected, durable
state stays in the core, and a cleared webview would show the page again.

**A page, opened by the launch check and the About button.** `View` gains `whats-new`. `App`
calls `take_whats_new` once at start, and opens the page when it says so; the About page's
"What's new" button opens it too. The page shows the heading's version, the body in the Markdown
component and a close button that returns to the view it was opened from (Home at launch). It is a
page in the main sheet, like Settings, not a modal.

**Ownership.** The core owns when the page shows (durable state); the UI owns the page and the
bundled text; the sidecar is not involved.

## Risks / Trade-offs

- [A forgotten changelog on release day would show the old notes] → the test against
  `package.json` fails the pull request, and the tag build fails on the heading.
- [Existing installs have no remembered version, so the first update into this feature shows
  What's new for the updating version once] → intended; it is the one update that cannot be told
  from a fresh install otherwise, and fresh installs are told apart by the settings file.
- [The page opens over whatever the user was doing at launch] → only once per update, with a
  button to dismiss it.
- [`CHANGELOG.md` is outside `src`, and Vite's dev server serves only inside the project] → the
  repository root is the project root, so a relative import from `src` resolves in dev and build.
