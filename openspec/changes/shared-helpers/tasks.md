# Tasks

Evidence for each item (copies with `path:line`) is in the scan reports and in PROGRESS.md's
"For #26" notes. Each task is reviewed uncommitted before its commit.

## 1. Rust core

- [x] 1.1 Add `sync.rs` with `locked(&mutex)` and `Watched<T>` and use them for every lock
  fallback and the five status-and-subscribers copies; add write-then-rename to `paths.rs` and
  stored-ID parsing to `store.rs`, used by their copies; verify with `cargo test`.
- [x] 1.2 In `ipc.rs`, one settings update-and-save helper, one `spawn_blocking` error wrapper and
  one "stop replies, then cancel runs" helper; split `runs::answer` into one function per method
  and `routing::route` into its steps, with `start_reply` taking a `Decision`; rename `NoAnswer`'s
  fields and replace `CallKind`/`Place::call`'s `Option` with an enum; verify with `cargo test`.
- [x] 1.3 Read database rows into named structs in `store.rs`, `overview.rs` (splitting
  `overview()` into its queries), `comments.rs` and `assets.rs`; a `NewComponent` struct for
  `conversations.rs`'s component tuple; an enum for `FileEntry.source`; a struct for `store.rs`'s
  `(Uuid, Uuid)` pairs; one name for the `dev_app` parameter; verify with `cargo test`.

## 2. UI

- [x] 2.1 One colour module in `minime/miniMeColors.ts` used by `chart-model.ts`, reading
  `oklch(...)` solids too, with a test that an `oklch` solid gets real wash and edge colours; one
  "open a file" hook; a `count(n, noun)` helper in `lib/format.ts`; a `useLoad` hook for the
  fetch-on-mount effects; verify with `npm test` and `npx tsc --noEmit`.
- [x] 2.2 One status-line row and subscription hook for the three status lines; one load-and-save
  hook for the Mini-Me and Trait editors; SettingsView's error line as a `SettingRow` prop and one
  `SwitchRow` for its switch rows; verify with `npm test` and `npx tsc --noEmit`.
- [x] 2.3 Remove dead code (`useCanFeature`, `useFeatureFlag`, `ui/progress.tsx`, `FileMark`'s
  `size`, the playground's `COPIES` and returned `spawn`, `export`s used only in their file); the
  renames `editsWaiting` → `editsLabel`, `ALL` → `ALL_GROUPS`, `dragging` → `draggingFiles`; a
  `TheoriesData` type and a `ReactionPills` component; verify with `npm test` and
  `npx tsc --noEmit`.

## 3. Sidecar

- [x] 3.1 Shared helpers in `adapters/base.py` and `adapters/providers.py` for the request-handler
  skeleton, the structured-answer error mapping, the `model_not_set` check, the text input schema
  and `component_or_text`; remove `theories_reply`, `papers_reply`'s narrative branch and
  `_log_shape`; verify with `uv run pytest`.
- [x] 3.2 Split `graph.py`'s `_Builder.step` into one method per Step kind and Theorize's `run`
  into polling and finishing; TypedDicts for the shapes `results()` returns; verify with
  `uv run pytest`.

## 4. Check

- [ ] 4.1 Run all suites and `npx tsc --noEmit`; in the app, send a message, open a document,
  and create a Teal Mini-Me to see its card's wash and edge; verify all pass.

## Workflow follow-up

- Archive with `/opsx:archive` (no specs to sync), mark Roadmap #26 Done and #27 Next, then open
  the pull request into `dev`.
