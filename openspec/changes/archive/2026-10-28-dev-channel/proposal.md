# Proposal

## Why

Development runs share the production app's identity: the same `Mini-Me Data` folder,
settings and keychain entries, so a development build that upgrades the database schema
leaves real Projects unreadable to the installed app.

## What Changes

- **Mini-Me Dev:** a second app, built from the same code, with its own identifier
  (`org.cipotato.mini-me.dev`), name "Mini-Me Dev", the development icon, its own
  `Mini-Me Data (Dev)` folder, its own settings and logs, and its own keychain entries. It
  runs next to Mini-Me and never reads or writes Mini-Me's data. It never checks for
  updates, so it can never install a Mini-Me release over itself.
- **Local runs:** `npm run tauri:dev` runs as Mini-Me Dev, so development never touches real
  Projects or keys.
- **Settings pages:** Settings becomes General (your name and Mini-Mes on Home, which were
  on the one-setting Profile and Appearance pages), Models & keys, Accounts, and a new About
  page with the app's name and version, for example "Mini-Me Dev 0.4.0", and the CIP and
  Ai2 logos of the two institutions that make Mini-Me (`src/assets/logos/`).
- **Developer mode:** a switch in Settings → About, on by default in Mini-Me Dev and off in
  Mini-Me, shows the developer options, each named "[DEBUG] …" and gathered in Settings →
  General → Developer: Jev's confidence threshold (moved from Accounts), "Show Jev's answers"
  (and the "[DEBUG] Jev" details under messages), and the Avatars page (moved from the
  sidebar). While it is off, the threshold keeps its saved value, Jev's answers are neither
  stored nor shown, the web inspector is unavailable, and right-click shows no menu outside
  text fields. Builds include Tauri's `devtools` feature so Developer mode can turn the
  inspector on in Mini-Me too; the inspector follows the switch from the next launch.
- **Housekeeping:** the `.vscode` folder is removed and ignored.

**BREAKING (development only):** after this change, `npm run tauri:dev` starts with an empty
`Mini-Me Data (Dev)` folder, default settings and no API keys or Ai2 sign-in; they must be
set up again in Mini-Me Dev. The installed Mini-Me app and its data are unaffected.

## Capabilities

### New Capabilities
- `dev-channel`: Mini-Me Dev's separate identity and data, local runs using it, that it does
  not update itself, and Developer mode with the options it shows.

### Modified Capabilities
- `projects`: the Mini-Me Data folder is named per app.
- `credentials`: keychain entries are stored under the running app's identifier.
- `app-updates`: Mini-Me Dev does not check for updates, and the About page with the version.
- `home` and `user-profile`: their settings move to Settings' General page.
- `routing`: the confidence threshold is shown only in Developer mode.

## Out of scope

- Copying Projects, settings or keys from Mini-Me into Mini-Me Dev.
- Building or publishing Mini-Me Dev in CI, and an update feed for it. A workflow that
  builds it from `dev` was considered and left out while there is one tester; it can be added
  later without changing the identity.
- An IT allowlist path for Mini-Me Dev's bundled Python on Windows.

No new external service, credential or cost.

## Impact

- Tauri config: `src-tauri/tauri.dev.conf.json` carries the dev identity.
- Rust core: `projects.rs` and `secrets.rs` take the data folder name and keychain service
  from the app's identifier; `ipc.rs` sets them at start-up and skips update checks in
  Mini-Me Dev.
- Rust core: `settings.rs` stores Developer mode; `ipc.rs` adds commands for it and keeps
  Jev's answers only while it is on.
- UI: the Settings pages, About and Developer mode in `SettingsView`; `MessageItem` hides
  Jev's answers without it; the sidebar loses its Avatars button.
- Docs: `docs/development.md` (running the app), `.gitignore`.
