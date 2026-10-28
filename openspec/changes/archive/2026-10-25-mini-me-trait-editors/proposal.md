# Proposal

## Why

Mini-Me's library holds only the fifteen built-in Mini-Mes and their Traits, and none of them
can be changed. Users cannot build the "little scientists" the product is named for. This
change adds editors for Mini-Mes and Traits, so users can make their own, keep them across
Projects, and @-mention them in Conversations or have routing pick them.

## What Changes

- A new **Library** view, opened from the sidebar next to Settings, lists every Mini-Me and
  Trait: built-in ones and user-made ones.
- **Mini-Me editor:** create, edit, duplicate and delete user-made Mini-Mes. The user sets the
  name, description and group (`thinking`, `literature` or `data`), picks the avatar's base,
  face and accessory from the existing parts, and picks a colour from the colour families or
  with a hue slider, as on the avatar debug page. The tint is derived from the hue, like the
  solid and the ink.
- **Workflow (list form):** a user-made Mini-Me's Workflow is an ordered list of Trait Steps
  that the user can add to, remove from and reorder. A duplicate of a Mini-Me whose Workflow
  has control Steps (for example Investigator) is an exact copy that runs the full Workflow.
  Its Workflow is shown but locked until the visual Workflow editor (Roadmap #16).
- **Trait editor:** create, edit, duplicate and delete user-made Traits. User-made Traits are
  prompt-based. The user sets the name, description, instructions and which model tools
  (`save_file`, `show_table`) the Trait may use. A Trait that a user-made Mini-Me still uses
  cannot be deleted; the editor names those Mini-Mes.
- Built-in Mini-Mes and prompt-based built-in Traits can be opened and duplicated, but not
  edited or deleted.
- The Rust core stores user-made definitions app-wide in one `user-library.json` in the
  Mini-Me Data folder. It merges them with the built-in library and checks them with the
  same rules. A user entry that breaks a rule is skipped and reported, and the app starts
  anyway.
- After a save, the next message uses the new definitions: the `@` list, routing (Jev) and new
  runs all see them. Runs that are already running or paused keep the definitions they
  started with.

## Capabilities

### New Capabilities
- `library-editors`: the Library view, the Mini-Me and Trait editors, the user library file
  and the rules for creating, duplicating, editing and deleting user-made Mini-Mes and Traits.

### Modified Capabilities
- `mini-mes`: the Trait library and the Mini-Me definitions are no longer read-only. They
  hold built-in and user-made entries, and each entry says which it is.
- `workflows`: the load-time Workflow checks also apply to user-made Mini-Mes. A broken
  user-made entry is skipped instead of refusing the whole library.

## Out of scope

- The visual (canvas) Workflow editor, and editing control Steps: Roadmap #16.
- A per-Trait provider or model choice: Traits keep using the model chosen in Settings.
- User-made Traits on adapters other than `prompt`. Built-in Traits that run fixed code
  (Asta, data and placeholder Traits) can be opened but not duplicated. A duplicated Mini-Me
  that uses them keeps referencing the built-in Trait.
- Trait icons and Trait colours in the UI. DESIGN.md retires Trait colours, and per-Trait
  line icons are left for a later change.
- Importing, exporting or sharing definitions between installations.

## New services, credentials or costs

None. Editing makes no network calls. Running a user-made Mini-Me uses the provider and key
already configured in Settings, at the user's normal LLM cost.

## Impact

- **Rust core:** `library.rs` gains user entries, merging, per-entry checks and saving. The
  library becomes swappable at run time for `Routing` and `Runs`, which currently hold an
  `Arc<Library>` fixed at startup. There are new IPC commands to list, save and delete
  definitions.
- **UI:** a new `library` view and sidebar entry, plus Mini-Me and Trait editor pages built
  from the avatar debug page's part grid and colour picker. `useMiniMes` must refresh after a
  save, because it currently caches for the whole session.
- **Sidecar:** no change. Runs already carry their Workflow and Trait definitions in
  `run.start`.
- **Storage:** a new `Mini-Me Data/user-library.json`. Project listing already ignores
  anything that is not a folder.
