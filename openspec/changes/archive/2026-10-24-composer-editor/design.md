# Design

## Context

`Composer.tsx` is a `<textarea>` with transparent text over a layer that draws the same text
with pills. References are `DraftReference`s tracked by string offset in
`src/protocol/references.ts`, padded with U+202F so the pills have room. Caret stepping,
selection snapping, Backspace over a pill and copying as sent text are all hand-written
against those offsets. Schibsted Grotesk has no U+202F, so each pad falls back to another
font and the text box and the layer measure it differently.

Attaching goes through `import_assets`, which opens the native picker in the core, so paths
never come from the UI (`ipc.rs`). The UI cannot read an Asset's bytes: it lists Assets and
asks the core to open them in another app. Sent messages draw Text Components with
`TextComponentChip` (Mini-Me pill with avatar, file chip, table or chart chip). The Tauri window
keeps its default drag-and-drop handling, so dropped files reach the app as paths in a window
event, not as files in the webview.

## Goals / Non-Goals

**Goals:**
- Chips that are elements of the editor's content, so nothing has to line up and the caret
  is always where the browser draws it.
- One look for a reference, in the composer and in sent messages.
- Pasted and dropped files become Assets through the core, with no path or file chosen by the
  UI.
- The same `content` and Text Components on the wire as today, so the core's checks, routing
  and the sidecar are untouched.

**Non-Goals:**
- Rich text. The editor holds plain text, line breaks and references only.
- Thumbnails outside the composer.
- Downscaling images in the core.

## Decisions

### Ownership by process
- **UI:** the editor, the suggestion lists, turning the editor's content into `content` and
  Text Components, the attachment row and its thumbnails, reading pasted images, and showing
  a drop target while files are dragged over the Conversation.
- **Rust core:** importing pasted bytes and dropped paths as Assets, remembering the paths of
  the latest drop, and reading an image Asset's bytes. The Assets and their files stay the
  only durable state.
- **Sidecar:** no change.

### TipTap for the editor
TipTap 3 (`@tiptap/core`, `@tiptap/react`, `@tiptap/pm`) on ProseMirror, with only the
extensions the composer needs: document, paragraph, text, hard break, undo/redo, placeholder
and mention (with `@tiptap/suggestion`). It is plain JavaScript in the webview, with no native
part and no system prerequisite, and ProseMirror is used in production in WebKit, Chromium
(WebView2) and WebKitGTK. A minimal composer bundle measured about 366 KB minified, 115 KB
gzipped; the app ships its bundle in the installer, so the cost is install size and a few
milliseconds of parsing at start.

Alternatives considered:
- Lexical: lighter, but its typeahead menu leaves more of the mention behaviour to write.
- Slate (Discord's editor): mentions are built by hand on top of it.
- A hand-written `contenteditable`: caret handling around non-editable chips, input methods
  and undo differ between the three webviews.
- Keeping the layer and bundling a font with U+202F: fixes this drift only; other characters
  missing from the font would drift the same way, and the layer still can't draw avatars.

### One reference node
References are one inline atom node, `reference`, from TipTap's mention extension, with the
attributes `kind` (`asset`, `mini_me` or `component`), `id` and `label`. Three suggestion
configurations (`@`, `#`, `$`) share it. `deleteTriggerWithBackspace` is on, so Backspace
removes the whole chip rather than leaving its sign. The node's `renderText` is its label, so
ProseMirror's clipboard text is the sent text. A React node view draws the chip with
`TextComponentChip`, as sent messages do; without an `onOpenAsset`, its file chip opens
nothing.

### From the document to the message
A pure function `draftFromDoc(doc)` walks the editor's JSON: text adds its characters, a
`reference` adds its label and a Text Component over it, a hard break adds `\n`, and
paragraphs are joined with `\n`. Its offsets are UTF-16 indices, as the core expects. This
replaces `draftMessage`, `PILL_PAD`, `insertReference`, `appendReference`, `updateReferences`,
`pillAt` and `caretStep`. `segments`, `markdownSource`, `miniMeSuggestions`, `fold` and the
`…Target` builders stay.

### Keys and lists
The suggestion plugin handles keys first while a list is open (arrows, Enter, Tab, Escape),
feeding the existing list markup through React state. Otherwise Enter sends and Shift+Enter
inserts a hard break. ProseMirror leaves keys to an input method while it is composing. The
`#` list still fetches Assets with `list_assets`; `@` and `$` filter in the UI as today. The
`@` and `#` buttons insert their sign at the selection, with a space before it when needed.
`ComposerHandle.appendReference` inserts a space and the node at the end of the document
without moving the selection, so the reference button keeps working.

### Attachments, thumbnails and pasting
The attachment row sits inside the composer above the editor. For an attachment whose media
type is `image/png`, `image/jpeg`, `image/gif` or `image/webp`, the UI calls
`read_image_asset(project_id, asset_id)`, which answers the raw bytes as a
`tauri::ipc::Response` after `assets::find` and the Project-folder check. The UI makes a
`blob:` URL for the thumbnail and revokes it when the attachment is removed or the composer
unmounts. Thumbnails are drawn at a fixed small size with `object-fit: cover`.

The editor's `handlePaste` looks for image files on the clipboard. For each, it sends the bytes
to `import_pasted_image(project_id, name, media_type)` as a raw request body, so the image is
not encoded as JSON, and returns `true` so ProseMirror inserts nothing. Without an image, the
paste goes to ProseMirror as text. The core writes the bytes with a new `assets::import_bytes`
under a fresh `assets/<id>/` folder, as `import` does, registered as `upload`.

### Dropping files
The core keeps `on_window_event`'s `DragDrop::Drop` paths in `AppState`, replacing them on
every drop. The UI listens with `getCurrentWebview().onDragDropEvent` while a Conversation is
open: entering and moving show a "Drop to attach" overlay on the Conversation, leaving hides
it, and dropping calls `import_dropped(project_id, paths)`. The core imports each path that is
in the remembered set and is a file, skips folders, and refuses a path the operating system
did not report, so the UI can only import what the user dropped.

Alternative considered: turning off Tauri's drag-and-drop so the webview gets `File`s, which
would send every dropped file's bytes through the IPC and lose its original name on some
platforms.

## Risks / Trade-offs

- [The window event and the UI's drop listener race] → The core records the paths in its
  window event handler, which is expected to run before the event reaches the webview. If a
  call ever arrives first, the import is refused and the UI says so. Checked in the app on
  macOS and Windows.
- [A large image is read whole for its thumbnail] → Accepted; the bytes stay in the webview
  only while the attachment is in the composer.
- [Input methods and undo behave differently per webview] → Checked in the app on macOS and
  Windows, typing accented characters and undoing past a picked reference.
- [About 360 KB more JavaScript at start] → Accepted for a desktop app; see "TipTap for the
  editor".

## Migration Plan

None: messages, Text Components and Assets keep their shape.
