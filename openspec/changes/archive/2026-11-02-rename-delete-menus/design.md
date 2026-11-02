# Design

## Context
Projects are found by scanning Mini-Me Data for folders with a `project.sqlite`, and a Project's name is
read from its `project` table (`projects.rs`), so a folder's name does not matter to listing. Assets are
stored by ID (`assets/<id>/<name>`).

## Decisions
- **One menu.** A shared "…" menu component with a confirmation popover is used by every list, so
  Rename, Delete and the warning look the same.
- **Core does the work.** Rename, delete and duplicate are Rust commands; deletes run inside one
  database transaction, and a Conversation's running reply is stopped first.
- **Project folder named by ID.** New Projects use their ID; renaming updates the `project` row only.
  Existing Projects keep their folders, so nothing breaks.
- **Asset rename** updates the stored name and moves `assets/<id>/<old>` to `assets/<id>/<new>`, keeping
  the extension and Project-folder confinement (`paths.resolve`).
- **Show in folder** uses the opener plugin's reveal call on the resolved path.
- **Deleted references.** A message's reference keeps the asset ID; the chip checks that it still exists.

## Risks / Trade-offs
- Deleting a Project is irreversible. → A warning names what is lost, and it needs a confirmation.
- Deleting an open Project or Conversation. → The UI returns to Home or the next Conversation.
