# Design

## Context

- `src-tauri/tauri.conf.json` holds the production identity (`org.cipotato.mini-me`,
  "Mini-Me") and the update feed (`releases/latest/download/latest.json`).
  `tauri.dev.conf.json`, used only by `npm run tauri:dev`, changes the window title and icon.
- Tauri derives the settings and log folders from the identifier (`app_config_dir`,
  `app_log_dir`), but `projects.rs` hard-codes the `Mini-Me Data` folder name and
  `secrets.rs` hard-codes the keychain service `org.cipotato.mini-me`. `KeychainSecrets` is a
  unit struct used statically from `ipc.rs` and `ai2.rs`.
- `ipc.rs` starts update checks only in release builds (`!cfg!(debug_assertions)`), from
  the feed in the Tauri config.

## Goals / Non-Goals

**Goals:**
- One source for the app's identity, the Tauri config, from which the core derives
  everything else, so a build cannot mix production and dev identities.
- No change to how Mini-Me (production) is built or behaves.

**Non-Goals:**
- Moving data between the two apps; building or publishing Mini-Me Dev in CI.

## Decisions

### The identity lives in the Tauri config (config)
`tauri.dev.conf.json` becomes the Mini-Me Dev identity: `identifier`
`org.cipotato.mini-me.dev`, `productName` "Mini-Me Dev", the window title and the dev icons.
`npm run tauri:dev` already applies it, and a build with it (`tauri build --config
src-tauri/tauri.dev.conf.json`) is a separate app too (its own NSIS folder, `.app` bundle and
AppImage name). Tauri puts Mini-Me Dev's settings and logs under its own identifier.

*Alternative:* a Cargo feature or environment variable choosing the identity. Rejected: it
can disagree with the config Tauri bundles with, giving an app named Mini-Me Dev that writes
to `Mini-Me Data`.

### The core reads the identifier at start-up (Rust core)
`AppState::init` reads `app.config().identifier` and derives:
- the data folder name: `Mini-Me Data (Dev)` for an identifier ending in `.dev`, otherwise
  `Mini-Me Data` (`projects::data_folder_name`, passed to `ensure_data_root`);
- the keychain service: the identifier itself, stored once in a `OnceLock` in `secrets.rs`
  that `KeychainSecrets` reads, falling back to `org.cipotato.mini-me` when unset (tests).
  A global keeps the many static `KeychainSecrets` uses, including Ai2's token store,
  unchanged.

Both mappings are small pure functions with inline tests.

### Mini-Me Dev never checks for updates (Rust core)
`AppState::init` starts update checks only when the build is a release build *and* the
identifier is not Mini-Me Dev's (`projects::is_mini_me_dev`). Mini-Me Dev has no feed of its
own, and the inherited production feed would otherwise offer it Mini-Me's installer.

*Alternative:* a rolling GitHub pre-release built from `dev` on every push, with its own
feed. Considered and left out: with one tester who runs `tauri:dev`, the builds would rarely be
installed. Adding it later needs only a workflow, a feed URL in `tauri.dev.conf.json`, and
lifting this check.

### Version in Settings (UI)
An About page, last in Settings, shows `getName()` and `getVersion()`
from `@tauri-apps/api/app`, which return the bundled product name and version, so no core
command is needed.

### Settings pages (UI)
Settings becomes General, Models & keys, Accounts and About. General merges the former
Profile and Appearance pages, which held one setting each: "Your name" under You and "Show
Mini-Mes on Home" under Home. About is its own page so the version and the two institutions'
logos (`src/assets/logos/`) have a place that is not about appearance.

### Developer mode (Rust core and UI)
`settings.json` gains `developer_mode: Option<bool>`. Unset, it follows the app
(`Settings::developer_mode(dev_app)`: on in Mini-Me Dev, off in Mini-Me), so each app has the
right default without a migration, and the user's choice, once made, sticks per app.
`get_developer_mode` and `set_developer_mode` read and write it. The core keeps Jev's answers
only when both "Show Jev's answers" and Developer mode are on, so turning Developer mode off
stops storing them without changing the hidden switch. The threshold is not gated: it is how
routing works, so it keeps applying with its saved value while hidden.

In the UI a shared `useDeveloperMode` hook, built like `useUserProfile`, gates the threshold
and "Show Jev's answers" rows (Accounts), the "[DEBUG] Jev" details under messages, and a
"[DEBUG] Avatars" row in General that opens the avatar parts page. The sidebar's Avatars
button, which only development runs showed, is removed; closing the page returns to Settings,
so `App.tsx` no longer needs the previous-view state it kept for that page.

*Alternative:* tie the options to development runs (`import.meta.env.DEV`). Rejected: Mini-Me
itself could then never show them, even for troubleshooting.

All developer options sit in a Developer section of Settings → General, so Accounts holds only
accounts and keys.

The web inspector is a property of the webview, fixed when the window is created. Builds
enable Tauri's `devtools` feature (needed for release builds), the window in the config is
marked `create: false`, and `lib.rs` creates it from that config with `.devtools(developer
mode)`. Turning Developer mode on or off therefore changes the inspector from the next launch;
the switch says so. While it is off the UI also cancels `contextmenu` outside inputs, text
areas and editable content, removing the webview's own Reload/Back menu; text fields keep
cut, copy and paste. On macOS the `devtools` feature uses private WebKit API, acceptable since
Mini-Me is not distributed through the App Store.

*Alternative:* only hide the right-click menu. Rejected: the inspector would stay reachable by
keyboard in development runs.

### Housekeeping
`.vscode/extensions.json` is deleted, and `.gitignore`'s `.vscode/*` and
`!.vscode/extensions.json` become `.vscode/`.

## Risks / Trade-offs

- [A Mini-Me Dev built and shared by hand goes stale] → it never updates; it is rebuilt from
  the source tree when needed.
- [Mini-Me Dev's bundled Python on CIP Windows machines is not allowlisted] → out of scope;
  Mini-Me Dev is for testing on machines that allow it.

## Migration Plan

Development runs start with an empty `Mini-Me Data (Dev)` folder, default settings and no
keys or Ai2 sign-in (see proposal, BREAKING); they are set up once in Mini-Me Dev. Rolling
back restores the shared identity; the dev folder and keychain entries are then unused and
can be deleted by hand.
