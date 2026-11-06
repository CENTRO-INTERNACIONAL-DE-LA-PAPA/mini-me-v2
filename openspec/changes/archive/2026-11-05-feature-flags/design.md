# Design

## Context

App settings live in `settings.json` in the OS app-config directory (`src-tauri/src/settings.rs`),
one file per app, so Mini-Me and Mini-Me Dev already keep separate settings. `AppState` in
`ipc.rs` holds them in a `Mutex<Settings>` and knows whether it is Mini-Me Dev (`dev_app`).
Developer mode is an `Option<bool>` there whose default follows the app; the UI reads it through a
`sharedValue` hook (`src/hooks/useDeveloperMode.ts`) that Settings refreshes after a change.
Traits reach the core during a call through `core.request` frames, dispatched by method in
`runs.rs`. The project is open source.

## Goals / Non-Goals

**Goals:**
- One place in the core that says which flags exist and which are on.
- Adding a flag is one entry in a Rust list; no UI or protocol change.

**Non-Goals:**
- Keeping anyone from turning a flag on. Keys are plain text in the open-source code, and anyone
  can edit `settings.json` by hand. Flags hide unfinished work; they are not access control.
- Hiding flagged Traits or Mini-Mes in the Library. A later change that flags one adds that.

## Decisions

### The core owns the list and the active set
`src-tauri/src/features.rs` holds `FEATURES: &[Feature]`, each `Feature { id, name, description,
key }` as static strings. It is empty in release code; a `#[cfg(test)]` list with one test
flag drives the unit tests. The module's functions take the list as an argument, so tests pass
their own list and production passes `FEATURES`.

*Alternative:* a JSON file bundled with the app. Rejected: a Rust constant is checked at compile
time and needs no loading or parsing.

### Two stored lists, so Mini-Me Dev can default to on
`Settings` gets `unlocked_features: Vec<String>` and `locked_features: Vec<String>` (both
`#[serde(default)]`, so existing settings files load). A flag is on when:
- in Mini-Me: its ID is in `unlocked_features`;
- in Mini-Me Dev: its ID is not in `locked_features`.

Entering a key adds the ID to `unlocked_features` and removes it from `locked_features`; turning
a flag off does the reverse. Both apps run the same code; only the rule above uses `dev_app`.
IDs of flags the build no longer carries are ignored when computing the active set and stay in
the file, where they do no harm.

*Alternative:* one `Option<Vec<String>>` that starts as "all" in Dev, as Developer mode does.
Rejected: once set, a flag added in a later version would start off in Dev, against the spec.

### Checking a key
The key is trimmed and compared with each flag's `key`; an empty key matches nothing. Keys are
plain text in the code.

*Alternative:* storing only a SHA-256 hash of each key, so reading the source would not reveal
it. Rejected: the project is open source on purpose and flags only hide unfinished work, so a
hash would add a dependency and a step to every new flag for no real gain.

### IPC and the UI
New commands in `ipc.rs`, registered in `lib.rs`:
- `list_feature_flags() -> Vec<FeatureFlag>`: the active flags, `{ id, name, description }`, in
  list order.
- `unlock_feature_flag(key) -> FeatureFlag`: saves and returns the matching flag, or fails with
  the code `wrong_key`.
- `lock_feature_flag(id)`: saves the flag as off.

The UI keeps the active flags in one `sharedValue` (`src/hooks/useFeatureFlags.ts`) with
`useFeatureFlag(id): boolean` for later features to check, and a refresh that the Settings
section calls after a change, as `useDeveloperMode` does. The section in `SettingsView.tsx` is a
key field with an "Enable" button, the "This key doesn't match any feature flag." message on
`wrong_key`, and the list of active flags, each with a "Turn off" button. It uses the existing
`src/components/ui` input and button components.

### The sidecar asks during a call
`runs.rs` answers `core.request` method `features.active` with `{ features: [ids] }`. The run
manager keeps its own copy of the active IDs, which `AppState` sets at start-up and whenever it
saves the flag lists (`Runs::set_active_features`, like the existing document gate), rather than
a reference to all settings. The sidecar's
call context gets `async def feature_on(self, feature_id) -> bool`, which sends the request; no
Trait uses it yet. No protocol event is added or changed; `core.request` and `core.response` are
reused as they are.

### Docs
`docs/feature-flags.md` explains adding a flag and checking it in the UI and in a Trait.

## Risks / Trade-offs

- [Anyone reading the code can turn a flag on] → Accepted: flags only hide unfinished
  features. A new key needs a new release.
- [A flag's ID changes between versions] → It counts as a new flag; testers enter its key again.
  The docs say to keep IDs stable.
- [The sidecar asks on every check] → One local request per check during a call is cheap; a
  Trait that checks often can ask once and keep the answer for the call.

## Migration Plan

None: both new settings fields default to empty, so existing settings files load unchanged and
no flag is on in Mini-Me until a key is entered.
