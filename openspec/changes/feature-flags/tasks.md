# Tasks

## 1. Flags in the core

- [x] 1.1 Add `src-tauri/src/features.rs` with `Feature`, the empty `FEATURES` list, a test-only
  list with one flag, key matching, and the active-set rule for Mini-Me and Mini-Me
  Dev; verify with unit tests: the right key matches its flag only, a wrong key and a key with
  surrounding spaces behave as the spec says, and the active set follows each app's default and
  ignores unknown IDs
- [x] 1.2 Add `unlocked_features` and `locked_features` to `Settings` with methods to turn a flag
  on and off; verify with unit tests that turning on and off moves the ID between the lists and
  that a settings file without the fields still loads

## 2. IPC and core requests

- [x] 2.1 Add `list_feature_flags`, `unlock_feature_flag` (failing with `wrong_key`) and
  `lock_feature_flag` to `ipc.rs`, saving the settings and updating the shared active set, and
  register them in `lib.rs`; verify `cd src-tauri && cargo test` passes
- [x] 2.2 Answer `core.request` method `features.active` with `{ features }` in `runs.rs`, from
  the shared active set passed to the run manager; verify with a unit test in `runs.rs` that a
  call gets the IDs of the flags that are on
- [x] 2.3 Add `feature_on(feature_id)` to the sidecar's Trait call context in
  `sidecar/src/mini_me_sidecar/context.py`; verify `cd sidecar && uv run pytest` passes

## 3. Settings UI

- [x] 3.1 Add the three commands to `src/api.ts` and `src/hooks/useFeatureFlags.ts` with
  `useFeatureFlag(id)` and a refresh; verify `npm test` passes and `npx tsc --noEmit` reports no
  errors
- [x] 3.2 Add the "[DEBUG] Feature flags" section to the Developer page in
  `src/components/settings/SettingsView.tsx`: a key field with "Enable", the wrong-key message,
  the list of active flags with "Turn off", and a line when none is active; verify in the app that
  a wrong key shows the message and that the list starts empty in Mini-Me

## 4. Docs and checks

- [x] 4.1 Write `docs/feature-flags.md`: adding a flag with its key, keeping IDs stable, and
  checking a flag in the UI and in a Trait; verify the example matches `Feature` in
  `features.rs`
- [x] 4.2 In the app, with a temporary flag in `FEATURES`: enter its key, restart, turn
  Developer mode off and on, turn the flag off, and check it needs the key again; then remove the
  temporary flag and verify the list is empty again

## Workflow follow-up

- Add this change to the Roadmap (`docs/roadmap.md`) and mark it Done when finished.
- Archive the change with `/opsx:archive`, then open the pull request into `dev`, closing #89.
