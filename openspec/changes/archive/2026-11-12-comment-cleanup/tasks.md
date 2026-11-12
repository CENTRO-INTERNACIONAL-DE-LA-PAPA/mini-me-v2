# Tasks

Each task reads every comment in its files and applies `CLAUDE.md`'s Comments rules (design.md,
decision 1). Each is reviewed uncommitted before its commit. The scan's "Comments" notes are in
`~/.claude/projects/-Users-lajesfen-Desktop-CIP-mini-me-v2/refactor-scan/`.

## 1. Rust core

- [x] 1.1 Comments in `runs.rs`, `ipc.rs`, `store.rs`, `routing.rs`, `conversations.rs` and
  `sidecar.rs` (including the wrong "export" request at `runs.rs:390`); verify with `cargo test`
  and that `git diff` touches only comment lines.
- [x] 1.2 Comments in the other files of `src-tauri/src/` (including the misplaced `CoreFrame` doc
  at `link.rs:163` and the stale frame names in `link.rs`'s `SidecarFrame` doc); verify with
  `cargo test` and that `git diff` touches only comment lines.

## 2. UI

- [x] 2.1 Comments in `src/App.tsx`, `api.ts`, `main.tsx`, `protocol/`, `hooks/`, `lib/` and
  `components/{chat,documents,shell}` (including the misplaced docs in `api.ts` and `types.ts`,
  and `Sheet.tsx`'s To-do panel); verify with `npm test`, `npx tsc --noEmit` and that `git diff`
  touches only comment lines.
- [x] 2.2 Comments in the other folders of `src/components/`, leaving `ui/` alone; verify with
  `npm test`, `npx tsc --noEmit` and that `git diff` touches only comment lines.

## 3. Sidecar

- [x] 3.1 Comments and docstrings in `sidecar/` (source, tests and `scripts/`), leaving the
  model-facing docstrings and descriptions as they are (design.md, decision 2); verify with
  `uv run pytest` and that `git diff` touches only comments and docstrings.

## Workflow follow-up

- Archive with `/opsx:archive` (no specs to sync), mark Roadmap #25 Done and #26 Next, then open
  the pull request into `dev`.
