# Design

## Context

- `Library` (`src-tauri/src/library.rs`) is parsed once from the embedded
  `library/builtin.json` and shared as an `Arc<Library>` that `Routing` and `Runs` hold for
  the whole session (`ipc.rs` `AppState::init`). History, the Overview summary and mention
  checks borrow it through `Routing::library()`.
- `Library::problems()` already checks tools, Workflow rules, unique IDs, Title Case and the
  fallback Mini-Me. Every problem is a string that names the entry.
- A run snapshots its definitions in `RunSpec` (Workflow plus the Trait definitions). A
  paused run stores that snapshot in `project.sqlite`. In-flight and paused runs are
  therefore already unaffected by later edits.
- The sidecar receives Workflows and Traits in `run.start`, and the Mini-Me list in
  `route.start`. It holds no library of its own.
- The UI gets `MiniMeSummary` through `list_mini_mes`, and `useMiniMes` caches that list for
  the whole session in a module-level promise.
- `AvatarDebugView` already has the part grid (base, face, accessory) and the colour picker
  (families plus hue slider), but both are private to that file.
- `projects::list` only treats folders under Mini-Me Data as Projects, so a file next to them
  is ignored.

## Goals / Non-Goals

**Goals:**
- Make the library swappable at run time, so a save takes effect on the next message without
  a restart.
- Keep one set of checks for built-in and user-made definitions.
- Reuse the avatar page's pickers rather than building a second set.

**Non-Goals:**
- Concurrent editing from several windows. The app has one window, and the core serialises
  saves.
- Versioning or undo of definitions.
- Any sidecar change.

## Decisions

### 1. The Rust core owns the user library; the UI only edits drafts
The core (new `library` store code in `library.rs`, or a small `user_library.rs` next to it)
loads, checks, merges and writes `user-library.json`. The UI keeps an unsaved draft in React
state and sends the whole definition on save. Durable state stays in the core, as the
architecture requires. The sidecar is untouched.

### 2. A swappable library: `LibraryStore` with a snapshot per use
`AppState` gets one `Arc<LibraryStore>` that wraps `RwLock<Arc<Library>>` plus the skipped
entries. `Routing` and `Runs` take the store instead of an `Arc<Library>`, and call
`store.current()` once per message or run to get an `Arc<Library>` snapshot. A save builds
the new merged `Library`, checks it, writes the file and only then swaps the `Arc`. Readers
never see a half-applied edit, and a reply keeps the snapshot it started with.
*Alternative:* rebuild `Routing` and `Runs` on each save. Rejected, because both hold live
state (open runs, routing calls).

### 3. Entry origin is computed, not stored
`Library` keeps the built-in and user-made entries in one list, plus the set of built-in IDs.
`MiniMeSummary` gains `built_in: bool`, and a new `TraitSummary` (id, name, description,
adapter kind for "can be duplicated", tools, instructions, built_in, used_by) feeds the
Trait list and editor. `user-library.json` has exactly the built-in format, so nothing in it
marks the origin. The file it is read from is the origin.

### 4. Checks: per-entry on load, whole-library on save
- **Load:** parse the file as `{ traits: [Value], mini_mes: [Value] }` so a single bad entry
  cannot fail the parse. Parse each entry on its own. Add Traits one at a time, and keep one
  only if the library's problems don't grow. Then do the same for Mini-Mes; a Mini-Me that
  references a skipped Trait fails naturally with "unknown Trait". Skipped entries keep their
  raw JSON and their problem strings.
- **Save:** apply the edit to a copy of the merged library, run `problems()`, and refuse with
  the full list if it is not empty. Built-in IDs are refused for save and delete. New
  name-uniqueness checks (Mini-Mes among Mini-Mes, Traits among Traits, ignoring case) are
  added to `problems()`. They only bite on user entries, because the built-in names are
  already unique.
- Title Case is relaxed to "each word starts with an uppercase letter or a digit", so
  "Plan Copy 2" is valid. Built-in names still pass.
- User-made Traits must have adapter `prompt` and non-empty instructions. These are new
  checks, applied only to user entries.

### 5. File writing
Saves write `user-library.json.tmp` in Mini-Me Data, then rename it over the target (atomic
on all three OSes for same-directory renames). The written file contains the valid user
entries in their current order, followed by the skipped raw entries unchanged. If the file
was unreadable JSON at startup, the store is marked read-only, and saves and deletes return
an error. That way a typo made by hand is never silently overwritten. No Project folder is
touched, and no Trait tool can address Mini-Me Data's root, so Project confinement holds.

### 6. IPC commands
- `list_library` → `{ mini_mes: MiniMeSummary[], traits: TraitSummary[], skipped:
  [{ kind, name?, problems }], read_only: bool }`
- `get_mini_me(id)` → the full `MiniMe` (with Workflow) plus `built_in`. Trait definitions
  are already in `list_library`.
- `save_mini_me(mini_me)`, `save_trait(trait)` → the new `list_library` result, or an
  `AppError` whose message lists the problems.
- `delete_mini_me(id)`, `delete_trait(id)` → the new `list_library` result. Deleting a Trait
  in use returns an error that names the Mini-Mes.
- `list_mini_mes` stays, and reads from the current snapshot.

These are request/response IPC commands. No protocol events are added or changed, because
the editors are local configuration and not Conversation activity.

### 7. IDs, Step IDs and defaults
- New Mini-Mes and Traits get a UUIDv7 from the core when the UI sends one with a nil ID, so
  the core owns ID creation.
- A new Trait Step's ID is the Trait name in kebab-case, with `-2`, `-3`… appended when it is
  taken. The UI makes it, and the core's uniqueness check guards it.
- A user-made Trait's `color` field stays in the data model, because the format requires it.
  The core fills in one fixed neutral fill when it creates the Trait, and the editor does not
  show it, because DESIGN.md retires Trait colours.
- A duplicated Trait copies the original's instructions and tools. A duplicated Mini-Me
  copies everything, the Workflow included, with a new ID.

### 8. UI structure
- `View` gains `{ kind: "library", tab }`, `{ kind: "mini-me", id?, from? }` and
  `{ kind: "trait", id?, from? }`. The sidebar footer gets a "Mini-Mes & Traits" entry with
  three stacked avatars, as in the design file. The Library and Settings both use a centred
  block with a 160px section list beside the page.
- `avatar/PartGrid.tsx` and `avatar/ColorPicker.tsx` are extracted from `AvatarDebugView`, and
  both the debug page and the Mini-Me editor use them. `palette.ts` gains `tintForHue(hue)`
  (oklch 0.94 0.04 hue) and a `colorsForChoice` helper returning `{ tint, solid, ink }`.
- A `library.ts` module holds pure helpers that get frontend tests: `copyName(name, taken)`
  for "X Copy"/"X Copy n", `nextStepId(traitName, ids)`, and `isListWorkflow(workflow)` (only
  Trait Steps).
- `useMiniMes` gains a `refreshMiniMes()` that clears the cached promise and notifies
  subscribers. The editors call it after every save or delete, so pills and the `@` list
  update in place.
- The locked Workflow view is a read-only nested list (indent per loop, branch or parallel
  level, with branch labels), built from the Step data. It shares no code with the future
  canvas.

## Risks / Trade-offs

- **[Risk]** Editing a Trait that a paused run uses could confuse the user when the run
  resumes with the old instructions. → This is the intended snapshot behaviour, and already
  how paused runs work.
- **[Risk]** A user Mini-Me with a vague description could pull routing away from built-ins.
  → The description is required. Routing still falls back to Assistant below the threshold.
- **[Risk]** Moving `Routing` and `Runs` to the store touches many test constructors that pass
  `Arc::new(Library::builtin())`. → `LibraryStore::builtin()` is a one-line replacement.
- **[Trade-off]** Duplicating fixed-code Traits is not possible. Users who want a variant of
  *Find Papers* must wait for adapter options in a later change.
- **[Trade-off]** One file for all user definitions is simple, but the whole file is rewritten
  on every save. That is fine for the expected size (tens of entries).

## Migration Plan

Nothing to migrate: the file is new, and its absence means "no user entries". Rolling back to
an older build ignores the file. Replies from user-made Mini-Mes then show as an unknown
Mini-Me, as the existing spec already handles.
