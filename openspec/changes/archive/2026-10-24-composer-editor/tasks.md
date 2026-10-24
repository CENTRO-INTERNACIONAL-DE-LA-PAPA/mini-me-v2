# Tasks

## 1. Importing and reading Assets in the Rust core

- [x] 1.1 Add `assets::import_bytes(project, name, bytes)` that stores the bytes under a fresh `assets/<id>/` folder with a safe file name and registers an `upload` Asset, and a function giving a pasted image's name (`Pasted image` plus the extension of its media type, or the clipboard's file name when there is one). Verify: `cd src-tauri && cargo test assets` passes with tests for a stored pasted PNG, a name with characters Windows forbids, and the fallback name.
- [x] 1.2 Remember the latest drop: keep the paths of `WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. })` in `AppState` (registered with `on_window_event` in `lib.rs`), replaced on each drop. Add `assets::import_dropped(project, paths, dropped)` that imports each path in `dropped` that is a file, skips folders, and refuses a path not in `dropped`. Verify: unit tests for importing a dropped file, skipping a folder, and refusing a path that was not dropped, with nothing imported.
- [x] 1.3 Add the commands `import_pasted_image` (raw request body, with `project_id`, `name` and `media_type` in the headers), `import_dropped(project_id, paths)` and `read_image_asset(project_id, asset_id)`, which answers the bytes as a `tauri::ipc::Response` for PNG, JPEG, GIF and WebP Assets and refuses any other media type. Register them in `lib.rs` and add them to `src/api.ts`. Verify: a unit test that reading a CSV Asset is refused and a PNG Asset returns its bytes; `cargo test` and `npx tsc --noEmit` pass.

## 2. The editor

- [x] 2.1 Add the TipTap dependencies (`@tiptap/core`, `@tiptap/react`, `@tiptap/pm`, `@tiptap/extension-document`, `@tiptap/extension-paragraph`, `@tiptap/extension-text`, `@tiptap/extension-hard-break`, `@tiptap/extension-mention`, `@tiptap/extensions` (with the placeholder and undo/redo), `@tiptap/suggestion`). Verify: `npm install` succeeds and `npx tsc --noEmit` passes.
- [x] 2.2 Add `draftFromDoc(doc)` that turns the editor's JSON into `content` and Text Components (labels for references, `\n` for hard breaks and between paragraphs, UTF-16 offsets), and remove `draftMessage`, `PILL_PAD`, `insertReference`, `appendReference`, `updateReferences`, `pillAt`, `caretStep` and `activeQuery` from `references.ts` with their tests. Verify: `npm test` passes with `draftFromDoc` cases for text around a mention, a hard break, two paragraphs, and a reference after an emoji (UTF-16 offsets).
- [x] 2.3 Let `TextComponentChip` draw a file chip that opens nothing when it gets no `onOpenAsset`, and add the `reference` node (TipTap's mention extension under that name, attributes `kind`, `id`, `label` kept as data attributes, `renderText` as the label, `deleteTriggerWithBackspace` on) with a React node view drawing `TextComponentChip`, so a chip in the composer looks as in sent messages (Mini-Me pill with avatar, file chip, table or chart chip with its icon). Verify: `npm test` passes, with `TextComponentChip.test.tsx` still passing.
- [x] 2.4 Rewrite `Composer.tsx` around the editor: the three suggestion configurations feeding the existing list markup and highlight, the `#` list from `list_assets`, Enter to send and Shift+Enter for a line break, the `@` and `#` buttons, the placeholder, blocking sending while a reply runs or Mini-Me is choosing, clearing after sending, and `ComposerHandle.appendReference` adding a reference at the end without moving the selection. Remove the pill layer and its helpers. Verify: `npm test` and `npx tsc --noEmit` pass. The user checks in the app: picking from each list with the mouse and the keyboard, the caret after several references, Backspace over a chip, undo, copying text with chips, Shift+Enter, an accented character, and the reference button.

- [x] 2.5 Collapse a run of `-` in a table's or chart's name into one in `componentNames`. Verify: `component-names.test.ts` passes with a chart titled "Yield — by variety" named `Yield-by-variety`.

## 3. Attachments, pasting and dropping

- [x] 3.1 Show attachments in a row at the top of the composer: an `AttachmentTray` with a thumbnail and name for PNG, JPEG, GIF and WebP attachments (bytes from `read_image_asset` as a `blob:` URL, revoked on removal and unmount), name and size for other files, and a remove button on each. Verify: `npx tsc --noEmit` passes. The user attaches a photo and a CSV in the app and removes one.
- [x] 3.2 Paste images: the editor's `handlePaste` sends each clipboard image to `import_pasted_image` and adds the returned Assets as attachments, leaving pastes without an image to the editor. Verify: the user pastes a screenshot and some text in the app.
- [x] 3.3 Drop files: while a Conversation is open, listen to `onDragDropEvent`, show a "Drop to attach" overlay while files are over the window, and on drop call `import_dropped` and add the returned Assets as attachments, showing the core's error when it refuses. Verify: the user drops a CSV, a photo and a folder in the app; the folder is skipped.

## 4. Specs and end to end

- [x] 4.1 Check the whole flow in the app on macOS: write a message with an `@` mention, a `#` file and a `$` table, attach a pasted screenshot and a dropped CSV, send it, and check that the reply's Mini-Me gets the references and attachments as before. Verify: the user confirms the reply.

## Workflow follow-up

- Archive with `/opsx:archive`, then ask before opening the PR from `feat/composer-editor` into
  `dev`, closing issue #66.
