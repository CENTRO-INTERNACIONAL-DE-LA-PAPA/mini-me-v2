# Proposal

## Why

The composer draws its chips on a layer behind a transparent text box, so both have to
measure every character the same. The chips' padding character is missing from the app's
font, so the caret drifts behind the text after each chip (issue #66). The layer also can't
draw anything but coloured text, which is why `@` pills in the composer have no avatar and
attachments show only as a name. An editor whose chips are real elements in the text removes
the drift and lets the composer show what sent messages show.

## What Changes

- **An editor with real chips.** The composer becomes a rich-text editor (TipTap) holding
  plain text and inline Text Components. `@` mentions, `#` files and `$` tables or charts are
  chips that look as they do in sent messages: a Mini-Me's pill with its avatar, a file chip,
  and a table or chart chip with its icon. The caret steps over a chip, and Backspace or
  Delete removes it whole.
- **Everything else stays as it is.** The `@`, `#` and `$` lists, picking with the keyboard,
  the `@` and `#` buttons, the reference button on tables and charts, Enter to send and
  Shift+Enter for a new line, copying and cutting as the sent text, and stopping a reply.
  Messages are sent with the same `content` and Text Components as today.
- **Attachments above the text.** Attached files show in a row at the top of the composer,
  each removable: an image as a small thumbnail with its name, any other file as its name and
  size.
- **Pasting and dropping.** Pasting an image into the composer attaches it. Dropping files on
  the open Conversation attaches them.
- **The core imports pasted and dropped files and reads images for thumbnails.** Two new
  ways to import an Asset: from pasted bytes, and from files dropped on the window (only paths
  the operating system reported for that drop). One new read: an attached image's bytes, for
  its thumbnail.

Out of scope:
- Formatting text in the composer (bold, lists, Markdown preview).
- Thumbnails in sent messages and in `#` chips; attachments on sent messages stay as name and
  size.
- Pasting files other than images, and attaching folders.
- Image formats the webviews can't draw everywhere (SVG, HEIC, TIFF), which attach as files
  without a thumbnail.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `mini-mes`: a picked mention in the composer shows the Mini-Me's pill with its avatar;
  picked references (`@`, `#` and `$`) are chips that act as one block; the suggestion lists
  include `$`.
- `component-references`: a run of `-` in a table's or chart's name becomes one, so a chart
  titled "Blight severity — distribution by variety" is named
  `Blight-severity-distribution-by-variety`.
- `assets`: importing a pasted image or dropped files as Assets, attachments shown above the
  composer text with thumbnails for images, and reading an image Asset for its thumbnail.

## Impact

- **Cost and data sent:** no new external service, credential or cost. Nothing new is sent
  to Jev, models or Asta.
- **UI:** `Composer.tsx` is rewritten around a TipTap editor; much of
  `src/protocol/references.ts` (padding, caret stepping, offset tracking) is replaced by
  turning the editor's document into `content` and Text Components. New dependencies:
  `@tiptap/core`, `@tiptap/react`, `@tiptap/pm` and the extensions it needs, about 360 KB
  minified in the main bundle.
- **Rust core:** commands to import pasted bytes and dropped files, a command to read an
  image Asset, and remembering the paths of the last drop on the window.
- **Sidecar:** no change.
- **Compatibility:** sent messages and stored data keep their shape; no migration.
