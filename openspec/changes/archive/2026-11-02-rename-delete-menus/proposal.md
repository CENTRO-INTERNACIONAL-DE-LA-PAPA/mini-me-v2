# Proposal

## Why

Conversations, Projects and files can be created but not tidied: lists only grow. Issues #56 and #87
ask for "…" menus that rename and delete them. They share one menu and one confirmation, so they are
done together.

## What Changes

- A "…" menu on each Conversation (in the sidebar row and the Conversation header) renames or deletes it.
- A "…" menu on each Project in the Project switcher renames or deletes it. There is no archive.
- A "…" menu on each file row (Files and the Overview's outputs) renames, deletes, opens, shows in its
  folder or duplicates the file.
- Deleting asks first. Deleting a Project removes its folder after a clear warning.
- A new Project's folder is named by its ID, and the name is only stored in its database, so renaming
  never moves files. Existing Projects keep their folders; their names were already read from the database.
- A reference to a file that was deleted shows as a "file removed" chip.

Out of scope: archiving Projects, moving Conversations or files between Projects, folders inside a
Project, and naming a Conversation automatically (#86).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `projects`: new Projects are folders named by ID; rename and delete a Project.
- `conversations`: rename and delete a Conversation.
- `assets`: rename, duplicate, delete, open and show in folder; references to a deleted file.

## Impact

- **Rust core:** rename and delete for Conversations, Projects and assets; duplicate and show-in-folder
  for assets; Project folders named by ID.
- **UI:** one shared "…" menu with a confirmation popover, used by the sidebar, the header, the Project
  switcher, Files and the Overview.
- **External services, credentials and costs:** none.
