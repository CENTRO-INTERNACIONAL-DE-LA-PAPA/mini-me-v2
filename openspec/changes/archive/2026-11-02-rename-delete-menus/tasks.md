# Tasks

- [x] 1.1 Conversations: `rename_conversation` and `delete_conversation` in the core (the delete stops the
      reply and removes messages, events, reactions, components, steps and thread rows in one
      transaction). Unit tests for both.
- [x] 1.2 Projects: new Projects use their ID as the folder name; `rename_project` and `delete_project`
      (stop replies, close, remove the folder). Unit tests.
- [x] 1.3 Assets: `rename_asset` (keep the extension), `duplicate_asset` ("<name> copy"), `delete_asset`,
      and `reveal_asset` (path for Show in folder). Unit tests.
- [x] 2.1 A shared "…" menu with a confirmation popover.
- [x] 2.2 Conversations: the menu on each sidebar row and in the header.
- [x] 2.3 Projects: the menu in the Project switcher, with the folder-removal warning.
- [x] 2.4 Files and the Overview's outputs: the five file actions.
- [x] 2.5 A "file removed" chip for a reference to a deleted file.
- [x] 3.1 `docs/using.md` describes the menus.
- [x] 3.2 Run `cargo test`, `npm test` and `uv run pytest`; check the menus in the app; archive.
