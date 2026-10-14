# Proposal

## Why

Mini-Me can only be run today by building it from source, so no CIP scientist can use it,
and every fix would need a manual reinstall. Before real Traits arrive, Mini-Me needs
installers built the same way every time and installed apps that keep themselves up to
date. It also needs its first install checked on a CIP Windows machine: the bundled Python
has to get past CIP's antivirus (OfficeScan), and IT has to allowlist it by its path.

## What Changes

- The app's product name becomes **Mini-Me**, in the window, the installed app, the
  installer and the install folder. The identifier stays `org.cipotato.mini-me`, so app data,
  settings and logs stay where they are.
- **Release builds in GitHub Actions:** pushing a version tag (`v0.2.0`) builds a Windows
  per-user installer with the bundled sidecar. It then creates a **draft** GitHub Release
  with the installer and its signed update file. Installed apps see a release only once the
  maintainer publishes the draft.
- **Version check:** the build fails if the tag does not match the app's version in its
  configuration files.
- **Update signing:** a new key pair signs the update files. The private key is a GitHub
  Actions secret, backed up at `~/.tauri/mini-me.key` on the maintainer's machine, outside
  the repository. The public key ships in the app, which refuses any update whose signature
  does not match.
- **Updates in the app:** a release build checks for a newer published release at launch
  and every few hours. It downloads it automatically, showing that an update is downloading
  with its progress in percent, then offers a restart to finish. An update the user does not
  restart for is installed when the app closes.
- **No code signing:** installers stay unsigned. The README explains the Windows SmartScreen
  prompt and how to get past it.
- **First Windows install check** on a CIP machine: OfficeScan's behaviour and the bundled
  `python.exe` path for the IT allowlist, recorded in the README. This check was moved here
  from the sidecar runtime change.
- The README documents how to cut a release.

## Capabilities

### New Capabilities

- `releases`: how installers are built, versioned, signed for updates and published, what
  each platform's installer installs and where, and the product name.
- `app-updates`: how an installed Mini-Me finds, downloads, verifies and installs a newer
  release, and what the user sees while that happens.

### Modified Capabilities

None. The sidecar still ends with the app as `sidecar-runtime` already requires. A restart
for an update is an app exit, so that requirement covers it too.

## Impact

- **Code:** Rust core (a new updater module, its commands and the exit handler), the UI (an
  update status line next to the sidecar status line), `tauri.conf.json` (product name,
  updater, Windows per-user install), a CI-only Tauri config enabling update files, and a
  GitHub Actions workflow.
- **Dependencies:** `tauri-plugin-updater` (Rust).
- **External services:** GitHub Releases. Installed apps contact `github.com` to check for
  and download updates. This sends the app's version and platform to GitHub, sends no
  user data, and costs the user nothing. GitHub Actions minutes are free for a public
  repository.
- **Credentials:** the update signing key (a GitHub Actions secret plus the local backup).
  Losing it means installed apps can no longer be updated automatically, and users would
  have to reinstall by hand once.
- **Users:** existing local installs named `mini-me` are not migrated; there are none
  outside development.

## Out of scope

- Code signing or notarization of the installers.
- macOS and Linux release builds, and the Microsoft Store. The maintainer builds a macOS
  app locally with `npm run tauri:release`; it does not update itself.
- Update channels (beta and stable), staged rollouts, and rolling back to an earlier
  version from inside the app.
- Release notes shown in the app beyond the version number.
- Automatic version bumps or changelog generation.
