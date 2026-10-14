# Design

## Context

- `npm run tauri:release` already builds a working macOS app with the bundled sidecar.
  `src-tauri/tauri.release.conf.json` adds the `bundle-sidecar` step and the
  `resources/sidecar/` directory resource. `sidecar/scripts/bundle.py` already has the
  Windows branches (`python.exe`, `Lib`, no `tcl`), but they have never run.
- The product name is `mini-me`. The window title is already "Mini-Me". The identifier is
  `org.cipotato.mini-me`, and Tauri derives the app config and log folders from it, not
  from the product name.
- The Rust core publishes the sidecar status to the UI through a command plus a channel
  (`get_sidecar_status`, `subscribe_sidecar_status`). `SidecarStatusLine` shows it in the
  Project picker and the Project sidebar.
- On `RunEvent::Exit` the core calls `Supervisor::shutdown`.
- The repository (`CENTRO-INTERNACIONAL-DE-LA-PAPA/mini-me-v2`) is public and has no
  `.github/` folder yet.

## Goals / Non-Goals

**Goals:**
- A tag push produces the same installers every time, without the maintainer's machine.
- The update path is exercised end to end before CIP users depend on it: a real install
  updated to a second real release.
- The UI shows update progress the same way it shows the sidecar status.

**Non-Goals:**
- Making `npm run tauri:release` on the maintainer's machine produce update files. Local
  release builds stay keyless.
- Any Windows-specific code beyond configuration. Windows behaviour is checked on a CIP
  machine, not emulated.

## Decisions

### D1. The Rust core owns updates, through `tauri-plugin-updater`'s Rust API

A new `updates` module in the Rust core checks, downloads and installs updates using the
plugin's Rust API (`UpdaterExt`). It publishes an `UpdateStatus` (see the `app-updates`
spec) through `get_update_status` and `subscribe_update_status`, and handles a
`restart_to_update` command. The UI only displays the status and sends that one command.
It gets no updater permissions in `capabilities/`, so the webview cannot trigger an install
itself.

- *Why the plugin:* it is Tauri's official updater. It handles the signature check (minisign
  over the update file), Windows NSIS updates and macOS `.app` replacement. It needs no
  system prerequisites on Windows, macOS or Linux and adds no runtime services. Writing our
  own would mean redoing signature verification and in-place app replacement.
- *Alternative:* the plugin's JavaScript API driven from the UI. Rejected: it would put an
  install action in the webview and split state across two processes, while the Rust core
  owns everything else that survives a restart.

### D2. The update feed is the latest published GitHub Release

The updater endpoint is
`https://github.com/CENTRO-INTERNACIONAL-DE-LA-PAPA/mini-me-v2/releases/latest/download/latest.json`.
GitHub's `releases/latest` never resolves to a draft or a prerelease, so "drafts reach users
only when published" holds without any code. `latest.json` is produced by `tauri-action`
and lists one signed update file per platform. The plugin compares versions with semver and
offers only newer ones.

### D3. Checks run on a timer in release builds only

When `cfg!(debug_assertions)` is false, the updater task starts in `setup`. It checks
immediately, then every 4 hours. A check is skipped while the status is `downloading` or
`ready`. Errors (network, a bad `latest.json`, a failed signature) are written to the app
log, and the status goes back to `none`.

### D4. Download progress in whole percent, published only on change

The plugin's download callback reports chunk sizes and an optional total. A pure function
turns (downloaded, total) into `Option<u8>` percent. The status is published only when the
percent changes, at most 101 updates per download, so the channel is not flooded. With no
total, the percent is `null` and the UI shows "Downloading update 0.3.0" without a number.

### D5. Restart and install-on-close both go through one install path

After `download` the core keeps the `Update` and its bytes, and sets `ready`.
- `restart_to_update`: `Supervisor::shutdown()` (as on exit), then `update.install(bytes)`,
  then `app.restart()`. On Windows, `install` starts the NSIS installer in `passive` mode
  (a progress window, no questions) and exits the process; the installer opens the new
  version.
- On `RunEvent::Exit` with a `ready` update: after the sidecar shutdown, call `install` and
  do not restart.

The sidecar shutdown happens first so `python.exe` is not running while the installer
replaces it; Windows cannot overwrite a running executable. Replies still streaming end the
way they do on any exit: the next open marks them `interrupted`.

### D6. Product name and Windows per-user install

`tauri.conf.json` gets `productName: "Mini-Me"`. Under `bundle.windows.nsis` it gets
`installMode: "currentUser"`, which installs to `%LOCALAPPDATA%\Mini-Me` without
administrator rights. Resources land beside the executable, so the sidecar's Python is at
`%LOCALAPPDATA%\Mini-Me\sidecar\python\python.exe`, the path IT allowlists. It stays the
same across updates because the installer reuses the install folder. The identifier is
unchanged, so `sidecar.log` and the settings stay where they are.

### D7. Update files are enabled only in CI, through a third config

`bundle.createUpdaterArtifacts: true` makes the build require the signing key. It goes into
a new `src-tauri/tauri.ci.conf.json`, which CI passes after the release config
(`tauri build --config src-tauri/tauri.release.conf.json --config src-tauri/tauri.ci.conf.json`;
Tauri 2 merges `--config` values in order). The `plugins.updater` block (`pubkey`,
`endpoints`, `windows.installMode: "passive"`) goes in `tauri.conf.json`, because every
build needs it to verify updates.

- *Alternative:* turn on `createUpdaterArtifacts` in `tauri.release.conf.json`. Rejected:
  every local release build would then need the key in an environment variable.

### D8. GitHub Actions workflow

`.github/workflows/release.yml` runs on `push` of tags matching `v*.*.*` and has two jobs.

- `draft` (Ubuntu): runs the version check (D9), then creates the draft release
  "Mini-Me <version>" through the GitHub API and passes its ID on. Creating the
  draft once, before the builds, keeps the two build jobs from each creating their own.
- `build`: `windows-latest` with `--bundles nsis`, kept as a one-entry matrix so another
  platform is one more entry. Steps: checkout; Node with npm cache; the stable Rust
  toolchain with cache; `astral-sh/setup-uv`; `npm ci`; `tauri-apps/tauri-action` (v1) with
  that `releaseId`, `uploadUpdaterJson: true` and `updaterJsonPreferNsis: true`. The signing
  key and its password come from the `TAURI_SIGNING_PRIVATE_KEY` and
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets. Each job adds its platform's entry to the
  release's `latest.json`.

Third-party actions are pinned to a full commit SHA.

### D9. One version check script

`scripts/check-version.mjs` (Node, no dependencies) reads the version from `package.json`,
`src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` (the `[package]` table). With a tag
argument it also compares against the tag minus its `v`. It exits non-zero naming every
mismatch. CI runs it with `${{ github.ref_name }}` before building. The README's release
steps run it before tagging.

### D10. Signing key generation and storage

`npm run tauri -- signer generate -w ~/.tauri/mini-me.key` creates the key pair, protected
by a random password. That password goes into the maintainer's macOS keychain
(`security add-generic-password -s mini-me-update-key`) and into the
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secret. The private key's contents go into
`TAURI_SIGNING_PRIVATE_KEY` with `gh secret set`. The public key is committed in
`tauri.conf.json`. The key is password-protected because GitHub secrets cannot be empty,
and with a password a copied key file alone is not enough to sign an update.

### D11. Update status line in the UI

`UpdateStatusLine` sits next to `SidecarStatusLine` in the Project picker and the Project
sidebar and follows the same pattern: a hook subscribing to the status, plus a component
that renders nothing for `none`. Its texts are "Downloading update 0.3.0 · 42%" and
"Mini-Me 0.3.0 is ready" with a "Restart" button. A pure `updateLabel(status)` function
produces the text and gets the frontend test.

### Process ownership

- **Rust core:** checking, downloading, verifying, keeping the downloaded update, installing,
  shutting down the sidecar first, and the update status.
- **UI:** displaying the status and sending the restart command.
- **Sidecar:** nothing. It is shut down before an install.
- **CI:** building, signing update files, creating the draft release.

No durable state is added. A downloaded update lives in memory until installed; if the app
crashes first, the next launch downloads it again.

## Risks / Trade-offs

- [OfficeScan quarantines the unsigned installer or `python.exe`] → the first install on a
  CIP machine is a task in this change. The exact path and the observed behaviour go into
  the README for IT before any user installs.
- [The signing key is lost] → installed apps can only be updated by a manual reinstall,
  once, after a new key ships. The local backup plus the keychain password make a loss
  unlikely.
- [Each update downloads the full ~40 MB package] → accepted. The plugin has no delta
  updates, and update frequency is low.
- [`tauri-action` merges `latest.json` wrongly when the two jobs finish close together] →
  the end-to-end update task checks `latest.json` lists both platforms. If it does not, the
  fallback is a final job that assembles `latest.json` from the uploaded `.sig` files.
- [Repeated `--config` is not merged as expected] → the first CI run shows it: the draft
  then lacks `.sig` files. The fallback is a single `tauri.ci.conf.json` that repeats the
  release config's two entries.
- [An update installs on close while a reply is streaming] → that reply is marked
  `interrupted` on the next open, as for any close today.
- [Local macOS builds find no macOS entry in `latest.json`] → the check fails quietly and
  is logged, as when offline; the maintainer rebuilds locally to update.
- [Unsigned macOS app] → used only by the maintainer, who opens it once through System
  Settings → Privacy & Security → Open Anyway. Updates downloaded by the app itself carry
  no quarantine flag.

## Migration Plan

1. Release `v0.1.0` (the current version) from CI. Install it on macOS and on a CIP Windows
   machine.
2. Release `v0.1.1` with no functional change, from the Windows-only workflow. Publish it
   and confirm the Windows install updates itself.
3. Rollback: delete or unpublish a bad release on GitHub, and installed apps stop being
   offered it. Apps that already updated are fixed by a newer release; there is no
   downgrade.
