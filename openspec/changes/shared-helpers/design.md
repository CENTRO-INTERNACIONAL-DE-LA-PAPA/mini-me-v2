# Design

## Context

See proposal.md for why. The evidence (each copy with `path:line`) is in the scan reports of
2026-11-11 and in the "For #26" notes gathered during #25, both under
`~/.claude/projects/-Users-lajesfen-Desktop-CIP-mini-me-v2/refactor-scan/`. Each process keeps
its own helpers: nothing moves between the Rust core, the UI and the sidecar.

`surfaceColors` (`src/components/minime/miniMeColors.ts`) takes the hue of a Mini-Me's `solid`
through `hexToOklch`, which reads only `#rrggbb`; `colorForHue` (`avatar/palette.ts`) stores
solids as `oklch(L C h)`, so those Mini-Mes get `NaN` wash and edge. DESIGN.md says wash and edge
come from the solid's hue.

## Goals / Non-Goals

**Goals:**
- Each repeated pattern is written once and called by name.
- No function needs a comment to be followed; long ones read as a list of named steps.
- No behaviour changes except the colour fix; every suite passes after each task.

**Non-Goals:**
- Moving code between files or splitting files (#27); a helper goes into an existing file of its
  concern, or into `sync.rs` (below).
- New features, new dependencies, or changes to IPC commands, events or link frames.

## Decisions

1. **One generic `Watched<T>`** (current value, `subscribe`, `set` that notifies only on a
   change and drops gone subscribers) replaces the five hand-written status-and-subscribers
   copies in `runs.rs`, `routing.rs`, `sidecar.rs`, `ai2.rs` and `updates.rs` (user's choice).
2. **Helpers live next to their concern** (user's choice): the lock fallback (`locked(&mutex)`)
   and `Watched<T>` in a new `src-tauri/src/sync.rs`, write-then-rename in `paths.rs`, stored-ID
   parsing in `store.rs`; UI helpers in `hooks/` and `lib/format.ts`; sidecar helpers in
   `adapters/base.py` and `adapters/providers.py`. No catch-all module.
3. **The OKLCH maths lives once, in `minime/miniMeColors.ts`**; `chart-model.ts` imports it.
   Reading a solid accepts both `#rrggbb` and `oklch(...)`, which fixes the wash and edge.
4. **Splitting a long function keeps its signature** where callers use it; the parts are private
   functions named for what they do.
5. **Renames replace explaining comments**; a comment that a rename makes unnecessary is deleted
   in the same task, never reworded.
6. **Tests move with the code they call**; a test changes only where a helper or a rename moves
   what it calls, plus one new test for the colour fix.

## Risks / Trade-offs

- [A merged helper hides a small difference between the copies] → Each task compares the copies
  before merging them; a copy that differs keeps its difference as a parameter or stays apart,
  and the task's report says so.
- [Large diffs] → One task per area; each is reviewed uncommitted before its commit.
- [`Watched<T>` changes when subscribers are called] → It keeps the existing contract: notify on
  change only, in order, outside any other lock; the existing subscription tests cover it.
