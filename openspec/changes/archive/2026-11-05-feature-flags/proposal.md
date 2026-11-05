# Proposal

## Why

Letting someone try an unfinished feature today means building and sending them a separate app.
Issue #89 asks for experimental features to ship in the normal release, switched off, each behind
its own key, so chosen testers can turn them on in the build everyone already has.

## What Changes

- The app carries a list of feature flags, each with an ID, a name, a short description and its
  key, written in the code as plain text. The project is open source, so keys are not secret;
  they keep features out of sight, not out of reach. The list starts empty; a flag that exists
  only in tests exercises the mechanism.
- The Developer page of Settings gets a "[DEBUG] Feature flags" section with a field to enter a key
  and a list of the active feature flags. A key turns on only its own flag; a wrong key turns on
  nothing and says so.
- Each active flag in the list can be turned off, which removes it from the list. Turning it back on
  needs its key again.
- Active flags are stored in the app settings and stay on after a restart. They stay on when
  Developer mode is turned off; Developer mode is needed only to see the section.
- In Mini-Me Dev every flag starts on without a key, and can be turned off like in Mini-Me.
- The UI and the sidecar ask the core whether a flag is on, so a later change can hide UI or change
  what a Trait does behind a flag.
- Out of scope: remote or server-side flags; keys that expire or are tied to a person; putting any
  existing feature behind a flag. No new external service, credential or cost.

## Capabilities

### New Capabilities

- `feature-flags`: the list of flags and their keys, turning a flag on with its key and off
  again, where flags are stored, their defaults in Mini-Me and Mini-Me Dev, and how the UI and the
  sidecar learn which flags are on.

### Modified Capabilities

- `dev-channel`: the Developer page also holds the "[DEBUG] Feature flags" section.

## Impact

- Rust core: a new `features.rs` module, two new fields in `settings.rs`, new IPC commands in
  `ipc.rs` and `lib.rs`, and a `features.active` method among the core requests in `runs.rs`.
- Sidecar: a helper on the Trait call context to ask whether a flag is on.
- UI: `api.ts`, a `useFeatureFlag` hook, and the Feature flags section in
  `src/components/settings/SettingsView.tsx`.
- Docs: how to add a flag and check it, in `docs/feature-flags.md`.
