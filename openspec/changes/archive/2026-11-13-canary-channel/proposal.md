# Proposal

## Why

Beta testers can only try what has been released: the development app, Mini-Me Dev, is never
built or published, so work merged into `dev` reaches nobody until the next release. Publishing
it gives testers each change as it lands, while their real work stays in Mini-Me. Releasing
Mini-Me also takes more steps than it needs: a script to run and a draft to publish by hand.

## What Changes

- **BREAKING** (for developers only): Mini-Me Dev becomes **Mini-Me Canary** everywhere: the
  identifier `org.cipotato.mini-me.canary`, the name and window title, the Projects folder
  `Mini-Me Data (Canary)`, the keychain service, the Tauri config file, the icon folder and the
  names in the code. Nothing is moved: a developer's Mini-Me Dev settings, keys and Projects stay
  where they are, under the old names.
- Running from source (`npm run tauri:dev`) runs Mini-Me Canary, as it ran Mini-Me Dev.
- A new workflow builds Mini-Me Canary for Windows, macOS and Linux on every push to `dev` that
  changes code, and publishes it as a GitHub pre-release when every platform built.
- A Canary build is named after its commit, not versioned: "Mini-Me Canary a1b2c3d", tagged
  `canary-a1b2c3d`.
- An installed Mini-Me Canary updates itself from Canary builds, through its own update feed.
  Mini-Me never sees a Canary build, and Mini-Me Canary never installs a Mini-Me release.
- A Mini-Me release is published by its workflow once every platform built, instead of waiting
  as a draft for the maintainer to publish it. While a platform's build has failed, it stays a
  draft.
- `npm run release` is removed. `CHANGELOG.md` is written as changes land; to release, its
  first line is given the new version, `npm run sync-version` copies it into `package.json`, and
  `dev` is merged into `main`.
- Developer mode and feature flags keep their defaults: on in Mini-Me Canary, off in Mini-Me.
- The specs are split: the app's identity, data and builds go to a new `canary-channel` spec,
  the Developer mode requirements move to a new `developer-mode` spec, and `dev-channel` is
  removed.

Out of scope:

- A "Beta" label on Mini-Me.
- Moving settings, keys or Projects from Mini-Me Dev to Mini-Me Canary.
- Code signing or notarizing either app.
- A separate identity for local runs; they share Mini-Me Canary's data with an installed Canary.
- Deleting old Canary pre-releases.

## Capabilities

### New Capabilities
- `canary-channel`: Mini-Me Canary, the app that development and beta testing run as: its
  identity and data, kept apart from Mini-Me; how its builds are named, tagged and
  published; and how an installed Mini-Me Canary updates itself.
- `developer-mode`: the Developer mode switch and what it shows: the Developer page, the debug
  records of replies and of Jev's answers, the web inspector, the sidecar log and the Avatars
  page. Moved from `dev-channel`.

### Modified Capabilities
- `dev-channel`: every requirement is removed; its content moves to the two specs above.
- `releases`: a release is published automatically once every platform built; the release script
  is replaced by a command that copies the changelog's version into `package.json`.
- `app-updates`: a release build of Mini-Me Canary checks for updates; the About page and the
  What's new rule name Mini-Me Canary.
- `projects`: Mini-Me Canary's Projects folder is `Mini-Me Data (Canary)`.
- `credentials`: Mini-Me Canary's keychain service is `org.cipotato.mini-me.canary`.
- `feature-flags`: the flag defaults name Mini-Me Canary.

## Impact

- **Tauri config and assets:** `src-tauri/tauri.dev.conf.json` becomes `tauri.canary.conf.json`
  and gains the Canary update feed; `src-tauri/icons/dev/` and `app-icon-dev.svg` are renamed;
  the `tauri:dev` script in `package.json` points at the new config.
- **Rust core:** `projects.rs`, `ipc.rs`, `settings.rs`, `features.rs`, `secrets.rs` (the app
  check, the data folder name, when update checks start, and names and comments).
- **UI:** Settings → About shows a Canary build as "Mini-Me Canary a1b2c3d".
- **Scripts:** `scripts/release.mjs` and the `release` script in `package.json` are removed, with
  the parts of `scripts/release-lib.mjs` only it used; a new `scripts/sync-version.mjs` is behind
  `npm run sync-version`. `check-version` is unchanged.
- **Workflows:** a new `.github/workflows/canary.yml`, with its own build job; `release.yml` gains
  a job that publishes the draft. The two files share
  nothing.
- **Docs:** `README.md` shortened to a summary, with the first-run setup moved to
  `docs/using.md`; `docs/development.md`, `docs/architecture.md`, `docs/feature-flags.md`,
  `CLAUDE.md`.
- **Users:** a Mini-Me release reaches installed apps without anyone having tried its installers
  first. The newest Canary build is the chance to try it.
- **GitHub:** Canary pre-releases and their tags are never deleted, so one of each is added per
  build.
- **No new service or credential:** Canary builds use GitHub Actions and Releases, and the update
  signing key the repository already holds. The repository is public, so the extra builds have
  no GitHub Actions cost.
- **CIP IT:** on Windows, Mini-Me Canary's bundled Python is at
  `%LOCALAPPDATA%\Mini-Me Canary\sidecar\python\python.exe`. The allowlist entry for Mini-Me's
  path does not cover it, so IT needs a second entry before testers on CIP machines can run it.
- **Developers:** after the rename, API keys and the Ai2 sign-in are entered once in Mini-Me
  Canary.
