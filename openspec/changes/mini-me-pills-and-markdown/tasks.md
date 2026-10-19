# Tasks

## 1. Mini-Me groups

- [ ] 1.1 Add `MiniMeGroup` (`thinking`, `literature`, `data`, serialised lowercase) as a
  required `group` on `MiniMe` and `MiniMeSummary` in `src-tauri/src/library.rs`, and set
  every Mini-Me's group in `library/builtin.json` as the `mini-mes` spec lists (Design §12).
  Verify: the user's run of `cd src-tauri && cargo test` passes.
- [ ] 1.2 Add Rust unit tests in `library.rs`: the built-in library gives Profiler the `data`
  group and Researcher the `literature` group, and a Mini-Me with `"group": "other"` fails to
  load. Verify: the user's run of `cd src-tauri && cargo test` passes.
- [ ] 1.3 Add `group` to the UI's `MiniMe` type in `src/protocol/types.ts` and to any test
  fixtures that build a `MiniMe`. Verify: the user's run of `npm test` passes.

## 2. The Mini-Me pill

- [ ] 2.1 Add `src/components/MiniMePill.tsx` (Design §8) and use it in place of
  `MentionChip` in `MessageItem.tsx`; delete `MentionChip`. Verify: in the user's run of
  `npm run tauri:dev`, a sent "@Skeptic" mention shows Skeptic's pill.
- [ ] 2.2 Add the shadcn Tooltip component (the user runs `npx shadcn@latest add tooltip`),
  restyle it to DESIGN.md's popover, and show it on reactions with each reactor as their
  pill or "You", removing the `title` (Design §11). Verify: in the user's run, pointing at a
  reaction shows the reactor's pill.

## 3. Markdown in replies

- [ ] 3.1 Add `react-markdown`, `remark-gfm` and `remark-breaks` to `package.json`; the user
  runs `npm install`. Verify: the lockfile lists them and `npm test` still passes.
- [ ] 3.2 Add `markdownSource(content, textComponents)` to `src/protocol/references.ts`,
  rewriting each Text Component as `[label](ref:N)` with the label escaped, last to first,
  skipping a component whose range doesn't hold its label (Design §5); add tests in
  `references.test.ts` for a mention, an asset, a label with `]`, and a mismatched range.
  Verify: the user's run of `npm test` passes.
- [ ] 3.3 Add `src/components/Markdown.tsx`: react-markdown with remark-gfm and remark-breaks,
  the HTML-as-text plugin, the image-as-link and link overrides with `openLink` and the
  `http`/`https`/`mailto` rule, `ref:` links as `MiniMePill` or file chips, memoized
  (Design §2–§6), and the element styles of Design §7. Verify: the user's run of `npm test`
  passes.
- [ ] 3.4 Render Mini-Me replies with `Markdown` in `MessageItem.tsx`, keeping user and system
  messages on `segments()` as plain text; render an opened Trait Step's output with
  `Markdown` in `WorkflowProgress.tsx`. Verify in the user's run of `npm run tauri:dev`:
  "@Skeptic the sky is blue" shows bold text and lists; a reply holding `<b>hi</b>` shows it
  as text; a table renders on a card; a link opens in the browser; an opened Investigator
  Step output is formatted; a sent "**draft**" stays as typed.

## 4. The @ list

- [ ] 4.1 Add `miniMeSuggestions(miniMes, query)` to `src/protocol/references.ts`: matches
  on the name ignoring case and accents, grouped Thinking, Literature, Data, empty groups
  dropped (Design §10); add tests for "@pro", "@" alone and an accented query. Verify: the
  user's run of `npm test` passes.
- [ ] 4.2 Show the grouped list in `Composer.tsx`: group headings, each entry's pill and
  one-line description, a keyboard highlight moved with ↑/↓ and picked with Enter or Tab,
  scrolling past about 8 rows; `#` suggestions get the same highlight. Verify in the user's
  run: "@pro" shows only Profiler under Data; "@", ↓, Enter inserts the second entry; "@zzz"
  then Enter sends the message.

## 5. Pills in the composer

- [ ] 5.1 Add the layer behind the composer's text box (Design §9): shared typography
  classes, transparent text with a visible caret, pills and file chips drawn with
  `box-shadow` instead of padding, scroll kept in step. Verify in the user's run: a picked
  "@Skeptic" shows as Skeptic's pill before sending; the caret stays on the text with a
  mention that wraps, with long text that scrolls, after undo, and after pasting; deleting a
  letter from the mention leaves plain text.

## 6. Documentation

- [ ] 6.1 Describe Markdown in replies (HTML and images shown as text or links) and the
  grouped `@` list in `docs/using.md`, add `group` to the Mini-Me fields and the `Markdown`
  and `MiniMePill` components in `docs/architecture.md`, and add react-markdown to "Built
  with" in the README. Verify: the user reads the diff.

## Workflow follow-up

- Archive the change (`/opsx:archive`), syncing its delta specs into `openspec/specs/`.
- Do not touch the Roadmap (`docs/roadmap.md`).
- Ask before committing, pushing and opening the pull request from `feat/message-rendering`
  into `dev`; it closes #6, #11 and #17.
