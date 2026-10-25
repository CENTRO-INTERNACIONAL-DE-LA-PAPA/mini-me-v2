# Tasks

## 1. Library rules and the user library in the Rust core

- [x] 1.1 Track the origin of each entry in `Library` (the set of built-in IDs) and add the new checks to `problems()`: unique Mini-Me names and unique Trait names ignoring case; Title Case relaxed to "each word starts with an uppercase letter or a digit"; user-made Traits must use adapter `prompt` and have non-empty instructions. Verify: `cd src-tauri && cargo test library` passes, with `builtin_library_is_consistent` unchanged and new tests for a duplicate name ("skeptic"), "Plan Copy 2" accepted, "translate text" refused, and a user Trait with adapter `data-plot` refused.
- [x] 1.2 Load `user-library.json`: parse it as raw `traits`/`mini_mes` arrays, add each entry only if it adds no problem (Traits first, then Mini-Mes), and keep skipped entries as raw JSON with their problems. A missing file means no user entries. Invalid JSON gives built-ins only, with the store marked read-only. Verify: unit tests (temp dir) for a valid user Trait plus Mini-Me, a Trait listing `show_chart` and the Mini-Me that runs it both skipped, a Mini-Me with no Steps skipped, an unknown `group` skipped, and invalid JSON marked read-only.
- [x] 1.3 Add save and delete for user entries on a copy of the merged library: refuse built-in IDs, refuse when `problems()` is not empty (returning every problem), assign a UUIDv7 to a nil ID, give new Traits the fixed neutral `color`, refuse deleting a Trait used by any Mini-Me (naming them), and write the file atomically (temp file and rename in Mini-Me Data) with the skipped raw entries kept unchanged. Refuse every save and delete while read-only. Verify: unit tests for saving a new Trait and reloading it from disk, refusing a Trait delete while in use, refusing to save Skeptic's ID, skipped entries surviving a save, and a save refused while read-only.

## 2. A swappable library for routing and runs

- [x] 2.1 Add `LibraryStore` (`RwLock<Arc<Library>>` plus skipped entries and the read-only flag) with `current()` returning an `Arc<Library>` snapshot and `LibraryStore::builtin()` for tests. Swap the `Arc` only after a successful write. Verify: a unit test that a snapshot taken before a save keeps the old definitions and `current()` after it shows the new ones.
- [x] 2.2 Make `Routing` and `Runs` take `Arc<LibraryStore>` and snapshot it once per message or run (mention checks, `route.start`'s `mini_mes`, `RunSpec::for_mini_me`, history and Overview author names). Build the store in `AppState::init` from the Mini-Me Data folder. Verify: `cargo test` passes, and a routing unit test shows a Mini-Me saved to the store is offered in the next `route.start`'s `mini_mes`.

## 3. IPC commands

- [x] 3.1 Add `built_in` to `MiniMeSummary`, a `TraitSummary` (id, name, description, adapter is `prompt`, tools, instructions, built_in, used_by Mini-Me IDs, placeholders left out), and the commands `list_library`, `get_mini_me`, `save_mini_me`, `save_trait`, `delete_mini_me` and `delete_trait` as in the design. Register them in `lib.rs`, and add them and their types to `src/api.ts` and `src/protocol/types.ts`. Verify: a unit test that `list_library` marks Skeptic built-in, lists *Refute* with `used_by` including Skeptic and leaves out *Document*. `cargo test` and `npx tsc --noEmit` pass.

## 4. Shared UI pieces

- [x] 4.1 Extract `PartGrid` and `ColorPicker` from `AvatarDebugView` into their own files under `src/components/avatar/`, and add `tintForHue` and a helper returning `{ tint, solid, ink }` for a family or hue to `palette.ts`. The debug page keeps working with the extracted parts. Verify: `npm test` passes, with a test that the Purple family keeps `#6E5BFF`/`#4A3AE0` and hue 120 gives the oklch tint 0.94 0.04 120.
- [x] 4.2 Add `src/components/library.ts` with `copyName(name, taken)`, `nextStepId(traitName, ids)` and `isListWorkflow(workflow)`. Verify: `library.test.ts` covers "Plan Copy", "Plan Copy 2", taken names ignoring case, a kebab-case Step ID with `-2` when taken, and Investigator's Workflow not being a list.
- [x] 4.3 Give `useMiniMes` a `refreshMiniMes()` that drops the cached list and updates every mounted user of the hook. Verify: `npx tsc --noEmit` passes. The user checks in task 6.2 that a saved Mini-Me appears in the `@` list without a restart.

## 5. Library view and editors

- [x] 5.1 Add the `library`, `mini-me` and `trait` views and a "Mini-Mes & Traits" entry at the bottom of `AppSidebar`, with three stacked Mini-Me avatars, as in the design. The Library view has a vertical list of its Mini-Mes and Traits sections beside a centred list. Each entry shows its name, its description and a built-in or user-made mark, and Mini-Mes also show their group. Mini-Mes can be filtered by group with chips. Each section offers "New Mini-Me" or "New Trait", and the view shows skipped entries with their problems, or a notice when the file could not be read. Verify: `npx tsc --noEmit` passes. The user opens the Library in the app and sees both sections and the group filter, with no placeholder Traits.
- [x] 5.2 Build the Trait editor: read-only for built-ins, with Duplicate only for prompt-based ones. For user-made Traits, fields for name, description, instructions and the `save_file`/`show_table` checkboxes, the list of Mini-Mes that use it, Save, and Delete with confirmation. Show the core's problems when a save or delete is refused. Verify: the user creates *Translate*, duplicates *Plan* into "Plan Copy", tries an empty instructions save and a lower-case name (both refused), and sees that *Find Papers* offers no Duplicate.
- [x] 5.3 Build the Mini-Me editor: read-only for built-ins, with Duplicate. For user-made Mini-Mes, fields for name, description (required) and group, the part grids with a live avatar preview, the colour picker, and the Workflow as an ordered list (add a non-placeholder Trait, remove, move up or down, last Step kept). A Workflow with control Steps is shown as a locked nested list. Save and Delete with confirmation. Call `refreshMiniMes()` after every save or delete. Verify: the user creates "Field Translator" with *Translate*, *Scout* and *Plan*, reorders the Steps, and duplicates Investigator to see the locked Workflow.

## 6. End to end

- [x] 6.1 Try to delete *Translate* while "Field Translator" uses it. Verify: the user sees the refusal naming "Field Translator".
- [x] 6.2 Check the flow in the app on macOS: "Field Translator" appears in the `@` list and answers when mentioned; a message without a mention can be routed to it; after editing *Translate*'s instructions, the next reply uses them; the Investigator copy runs its full Workflow including the approval; after deleting "Field Translator", its earlier replies show as "Mini-Me"; and after a restart the user-made definitions are still there. Verify: the user confirms each point.

## Workflow follow-up

- Archive with `/opsx:archive`, syncing the delta specs into `openspec/specs/`.
- Mark Roadmap #15 "Done" and #16 "Next" in `docs/roadmap.md`.
- Ask before opening the PR from `feat/mini-me-trait-editors` into `dev`.
