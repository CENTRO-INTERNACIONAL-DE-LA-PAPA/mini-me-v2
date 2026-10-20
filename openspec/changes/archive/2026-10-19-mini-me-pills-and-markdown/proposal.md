# Proposal

## Why

Mini-Me replies are shown as plain text, so the Markdown every prompt-based Mini-Me writes
(`**bold**`, lists, headings, tables) appears as raw symbols, in replies and in the Step
outputs opened in a Workflow's progress card (#6). The `@` list shows 15 Mini-Mes by name
only, in one flat list that is getting hard to scan (#11). And a Mini-Me's colour appears
only on `@` mentions in sent messages; in the `@` list, in the composer while typing and in
reaction tooltips its name is plain text, so users don't learn which colour is whose (#17).

## What Changes

- **Markdown in replies.** A reply authored by a Mini-Me, and a Trait Step's output opened in
  the progress card, render as GitHub-flavoured Markdown: bold, italics, headings, lists,
  block quotes, code, links and tables, styled per DESIGN.md. Raw HTML in the text is shown
  as text. Images are shown as links and never loaded. Links open in the default browser.
  Text Components in a reply stay chips. While a reply streams, a marker whose closing half
  hasn't arrived yet (such as `**bol`) shows as typed until it does.
- **One Mini-Me pill.** A shared pill (the Mini-Me's tint background and ink text, 999px
  radius) is used wherever the UI names a Mini-Me inline: `@` mentions in sent messages and
  in replies, the `@` list, picked mentions in the composer before sending, and the names
  in reaction tooltips. A Mini-Me that no longer exists shows a neutral pill.
- **Pills in the composer.** The composer stays a native text box; picked `@` mentions and
  `#` files are drawn as pills on a layer behind it, so typing, undo, paste and input
  methods keep working as before.
- **A searchable, grouped `@` list.** Typing after `@` narrows the list to Mini-Mes whose
  name matches. Each entry shows its pill and its description. Entries are grouped under
  headings (Thinking, Literature, Data), and the arrow keys move through them.
- **A `group` on each Mini-Me.** Mini-Me definitions get a `group`: `thinking`,
  `literature` or `data`. Every predefined Mini-Me has one, and the Rust core sends it to
  the UI with the rest of a Mini-Me's summary.

## Capabilities

### New Capabilities
- `message-formatting`: how the text of a Mini-Me reply and of an opened Step output is
  formatted: the Markdown that renders, what is shown as text instead (HTML, images), how
  links open, how Text Components stay chips and how streaming text is shown.

### Modified Capabilities
- `mini-mes`: Mini-Me definitions gain a `group`; a Mini-Me is shown as its pill wherever it
  is named inline (the `@` list, the composer, sent messages, reaction tooltips), and the
  `@` list filters, describes and groups Mini-Mes.

## Out of scope

- The 16px avatar inside the pill (comes with the avatar work, #14).
- Markdown in the user's own messages, and inside Interactive Components (theories, paper
  sources).
- Closing unfinished Markdown markers while a reply streams.
- Reply headers, which keep the name and the solid-colour mark.
- The Mini-Me editor, and choosing a group for user-made Mini-Mes (Roadmap #16).
- The note "Couldn't start a reply: …", which keeps naming Mini-Mes as plain text: it is a
  system message without Text Components. Since the routing fallback, Mini-Me no longer
  writes a note asking you to mention a Mini-Me, so that part of #17 has nothing left to
  change.
- Searching Mini-Mes by description in the `@` list.

## Impact

- **UI:** a new `Markdown` component used by `MessageItem.tsx` and `WorkflowProgress.tsx`; a
  new `MiniMePill` component replacing `MentionChip`; `Composer.tsx` gains the pill layer
  behind its text box and the grouped, searchable `@` list; reaction tooltips use a Tooltip
  component instead of the browser's `title`.
- **Rust core:** `MiniMe` and `MiniMeSummary` in `library.rs` gain `group`; every Mini-Me in
  `library/builtin.json` names its group.
- **Dependencies:** `react-markdown`, `remark-gfm` and `remark-breaks` (JavaScript only,
  bundled, no network); a shadcn Tooltip component built on the Base UI already in use.
- **No new external service, credential or cost.**
- Closes #6, #11 and #17.
