# Tasks

Builds and tests are run by the user (see CLAUDE.md); a task is done when their run confirms
it.

## 1. Product name and Windows install

- [x] 1.1 Set `productName` to "Mini-Me" and add `bundle.windows.nsis.installMode: "currentUser"` in `src-tauri/tauri.conf.json` (D6); verify `npm run tauri:release` builds `Mini-Me.app`, which opens with the sidecar reaching `ready`

## 2. Signing key

- [x] 2.1 Generate the update key pair at `~/.tauri/mini-me.key` with a random password, store the password in the macOS keychain as `mini-me-update-key`, and set the `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repository secrets with `gh secret set` (D10); verify `gh secret list` shows both and `security find-generic-password -s mini-me-update-key` finds the password

## 3. Updater in the Rust core

- [x] 3.1 Add `tauri-plugin-updater` to `src-tauri/Cargo.toml`, register it, and add the `plugins.updater` block (`pubkey`, the `releases/latest/download/latest.json` endpoint, `windows.installMode: "passive"`) to `tauri.conf.json` (D1, D2); verify `cargo build` succeeds
- [x] 3.2 Add the `updates` module with `UpdateStatus` (`none`, `downloading { version, percent }`, `ready { version }`), status publishing, and the pure percent function (D4); verify with unit tests that the percent is whole, `null` without a total, and only published when it changes
- [x] 3.3 Implement the check loop (at start, then every 4 hours, skipped while `downloading` or `ready`, release builds only), the download into memory, and errors returning the status to `none` with a log line (D3); verify with a unit test on the state transitions that a failed download returns to `none` and a `ready` update skips the next check
- [x] 3.4 Add the `get_update_status`, `subscribe_update_status` and `restart_to_update` commands, and install a `ready` update in the `RunEvent::Exit` handler after the sidecar shutdown (D5); verify `cargo test` passes and `cargo build` has no new warnings

## 4. Update status in the UI

- [x] 4.1 Add `UpdateStatus` to `src/protocol/types.ts` and `getUpdateStatus`, `subscribeUpdateStatus` and `restartToUpdate` to `api.ts`; verify `npm run build` type-checks
- [x] 4.2 Add `UpdateStatusLine` with a pure `updateLabel(status)` next to `SidecarStatusLine` in the Project picker and the Project sidebar, styled to DESIGN.md, with a "Restart" button when `ready` (D11); verify with a Vitest test of `updateLabel` for `downloading` with and without a percent, and for `ready`

## 5. Release workflow

- [x] 5.1 Write `scripts/check-version.mjs` (D9) and a `check-version` npm script; verify it passes with the current files and with `v0.1.0`, and fails naming the files with `v0.2.0`
- [x] 5.2 Add `src-tauri/tauri.ci.conf.json` with `bundle.createUpdaterArtifacts: true` (D7) and `.github/workflows/release.yml` (D8), with every third-party action pinned to a full commit SHA; verify `npm run tauri:release` still builds locally without a signing key
- [x] 5.3 Document in the README how to cut a release (bump the three versions, `npm run check-version`, tag, push the tag, check the draft, publish) and how to install the unsigned app on Windows (SmartScreen) and macOS (Gatekeeper); verify the steps match the workflow

## 6. First releases

- [x] 6.1 Push the tag `v0.1.0`; verify both jobs pass and the draft release has the Windows installer, the macOS app and a `latest.json` listing `windows-x86_64` and `darwin-aarch64` with signatures; then publish it
- [x] 6.2 Install `v0.1.0` from the release on macOS; verify it opens as "Mini-Me", the sidecar reaches `ready`, and *Echo* answers
- [x] 6.3 Install `v0.1.0` on a CIP Windows machine without administrator rights; verify the install folder is `%LOCALAPPDATA%\Mini-Me`, `sidecar\python\python.exe` is there, the sidecar reaches `ready` and *Echo* answers. Record OfficeScan's behaviour and the `python.exe` path for IT in the README
- [x] 6.4 Bump to `0.1.1`, release it, and check the draft has only the Windows installer, its `.sig` and a `latest.json` listing `windows-x86_64`. Leave it unpublished and confirm the Windows install reports no update; then publish it, confirm the download progress shows and "Restart" opens 0.1.1 with its Projects unchanged
- [x] 6.5 With the next release after `0.1.1`, let the Windows install download it and close Mini-Me instead of restarting; verify the next launch is the new version

## Workflow follow-up

- Archive the change (`/opsx:archive`), syncing its specs into `openspec/specs/`.
- Mark change 3 "Done" and change 4 "Next" in the README Roadmap.
