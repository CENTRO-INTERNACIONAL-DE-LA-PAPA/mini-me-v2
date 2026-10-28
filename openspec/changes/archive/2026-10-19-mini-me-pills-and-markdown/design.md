# Design

## Context

- `MessageItem.tsx` renders every message's `content` in one `<p>` with
  `whitespace-pre-wrap`, splitting it into `segments()` (`protocol/references.ts`) so that
  Text Components, stored as UTF-16 `start`/`end` offsets into the raw content, become chips.
  `@` mentions use a local `MentionChip`; `#` files use a neutral `Badge` that opens the Asset.
- `WorkflowProgress.tsx` shows an opened Trait Step's `output` in a `<p>` with
  `whitespace-pre-wrap`. A condition or loop Step's short decision text sits inline next to
  the Step's name.
- `Composer.tsx` is a shadcn `Textarea` with `DraftReference`s tracked beside the text.
  Its `@` list is a flat column of ghost buttons, filtered by `name.includes(query)`; Enter
  and Tab pick the first entry, and there is no keyboard highlight.
- Reaction pills set `title` to the reactors' names, a native tooltip that can only hold
  plain text. `src/components/ui/` has no Tooltip yet.
- `MiniMe` and `MiniMeSummary` (`src-tauri/src/library.rs`) carry `id`, `name`,
  `description` and `colors`; the UI's `MiniMe` type (`protocol/types.ts`) mirrors the
  summary. `library/builtin.json` defines 15 Mini-Mes.
- `components/interactive/links.ts` already opens URLs with `@tauri-apps/plugin-opener`,
  which the `opener:default` capability allows.

## Goals / Non-Goals

**Goals:**
- Mini-Me replies and opened Step outputs render Markdown safely, with Text Components kept
  as chips.
- One pill component for every inline Mini-Me name, including the composer before sending.
- An `@` list that can be searched, read and navigated with the keyboard as it grows.

**Non-Goals:**
- Markdown in user messages, system messages or Interactive Components.
- Repairing unfinished Markdown while streaming.
- The avatar inside the pill; user-chosen groups (the editor, Roadmap #16).

## Decisions

### 1. All of it lives in the UI, apart from `group`

Formatting, pills and the `@` list are presentation, so the UI owns them. The only durable
data is a Mini-Me's `group`, which the Rust core owns like the rest of a Mini-Me's definition
and sends in `MiniMeSummary`. The sidecar doesn't change.

### 2. Markdown with react-markdown, remark-gfm and remark-breaks

A new `components/Markdown.tsx` renders `content` with `react-markdown` and the plugins
`remark-gfm` (tables, strikethrough, task lists, autolinks) and `remark-breaks` (a single
newline is a line break, as plain-text replies show today, so the data Mini-Mes' line-by-line
replies keep their shape).

- **Why react-markdown:** it builds React elements, not an HTML string, so nothing goes
  through `dangerouslySetInnerHTML`, and chips stay React components. It follows CommonMark
  (micromark), and `remark-math` with `rehype-katex` can be added later for LaTeX (#16).
  Alternatives considered: `marked` + DOMPurify (an HTML string to sanitize, chips harder to
  keep); `markdown-to-jsx` (smaller, but it parses loosely and has no math path).
- **Platforms:** all three packages are plain JavaScript, bundled by Vite into the app, with
  no native code or network access, so they work offline on Windows, macOS and Linux. They
  add about 45–60 KB gzipped. Versions are pinned in `package.json` at their current major
  (`react-markdown` 10, `remark-gfm` 4, `remark-breaks` 4).

### 3. Raw HTML becomes text; images become links

react-markdown drops raw HTML unless `rehype-raw` is added, but the spec asks for it to be
*shown*. A small remark plugin in `Markdown.tsx` turns every `html` node into a `text` node
with the same value, so `<b>hi</b>` reads as typed. Images are overridden with a component
that renders a link with the alt text (or the URL when there is none), so nothing is fetched.

### 4. Links open in the browser through `openLink`

The `a` override renders a link that calls the existing `openLink` helper in
`links.ts` and prevents the webview from navigating. react-markdown's default
`urlTransform` already empties unsafe URLs; the override additionally renders any link whose
URL isn't `http:`, `https:` or `mailto:` as plain text. Links are ink-coloured and drop to 70%
opacity on hover (DESIGN.md).

### 5. Text Components pass through Markdown as `ref:` links

Before parsing, `Markdown.tsx` rewrites the content: each Text Component's range is replaced
by `[label](ref:N)`, where `N` is the component's index, with `[`, `]` and `\` in the label
escaped. Ranges are applied from last to first so earlier offsets stay valid. The `urlTransform`
lets `ref:` through, and the `a` override renders `ref:N` as the `MiniMePill` (a `mini_me`
component) or the file chip (an `asset` component), using the same open handler as today.

- Alternative considered: a remark plugin that splits text nodes at the components' offsets.
  It would need offsets mapped through micromark's positions, which shift wherever Markdown
  syntax is removed; the link rewrite needs no mapping.
- A Text Component inside a code span would show as `[label](ref:N)`. Mini-Me replies rarely
  hold Text Components, and none inside code, so this is accepted.

### 6. Parsing only when the content changes

`Markdown` is wrapped in `React.memo`, and the rewritten source is computed with `useMemo` on
`content` and `text_components`, so a finished reply is parsed once, and a streaming reply
only when a new chunk arrives. Unfinished markers render as typed, which is react-markdown's
behaviour without repair.

### 7. Markdown styling per DESIGN.md

Element overrides in `Markdown.tsx` carry Tailwind classes; there is no typography plugin.
Body text stays 15/1.6 `ink-2`; paragraphs and lists are spaced 0.5em; headings step down
from 18/600 to 15/600; inline code and code blocks use the mono font on `surface-2` with
radius 6; block quotes have a 2px `border` rule on the left. Tables sit in a white card
(border, radius 10, horizontal scroll when wide), with a `surface-2` header row in 12.5
muted text and 13.5 tabular-nums rows split by hairlines, as DESIGN.md's Table describes.
Opened Step outputs use the same component at `text-ui` size.

### 8. One `MiniMePill`

`components/MiniMePill.tsx` renders a name on a 999px-radius chip, with the Mini-Me's
`tint` background and `ink` text, or the neutral chip colours (`surface-2`, `ink-2`) when the
Mini-Me is unknown. It takes `miniMe?: MiniMe` and `children` (the text to show), so a
mention keeps the label it was sent with. It replaces `MentionChip` in `MessageItem.tsx` and
is used by the `@` list, the composer layer, reply Markdown and reaction tooltips. Padding
leaves room for the 16px avatar that #14 will add on the left.

### 9. The composer draws pills on a layer behind a transparent text box

The `Textarea` stays the input. Behind it, in the same grid cell, a `div` with the same font,
size, line height, padding, border width and wrapping (`whitespace-pre-wrap
wrap-break-word`) shows the same text: plain spans for text, and for each `DraftReference` the
pill or file chip. The textarea's text is transparent with a visible caret
(`caret-foreground`), so the user sees the layer's text and pills through it, and every input
behaviour stays native. The layer is `aria-hidden` and scrolls with the textarea (its
`scrollTop` follows the textarea's `onScroll`).

The pills on the layer must not change the width of their text, or the caret would drift
from what is drawn. Their horizontal padding is therefore text: a picked reference is
inserted with a narrow no-break space (`PILL_PAD`, U+202F) on each side, present in both the
text box and the layer, and its `DraftReference` range covers both. They get their colour
from `background-color` and their height from a same-coloured `box-shadow` spread
(`0 0 0 2px`) instead of `padding`, with `box-decoration-break: clone` so a mention that
wraps keeps both ends rounded. Being no-break, the padding never wraps away from its label.
`draftMessage` removes each reference's padding before sending, or turns it into a space
where it alone separated the label from other text, and shifts the Text Component offsets;
copy or cut from the text box goes through it too. A U+202F the user typed is left alone.

A picked reference acts as one block. Left and right arrows (with or without Shift) step
over it, Backspace or Delete next to it (also as a word deletion) selects it so the text
box's own deletion removes it, and a caret or selection end that lands inside it, by
clicking, dragging or other caret keys, is moved to its edge. The composer remembers the
references of each text it has held since the last send, so an undo that brings a text back
brings its pills back. Any other edit that touches part of a reference drops the reference
and leaves its text plain.

- Alternative considered: a contenteditable rich input (Lexical, TipTap). It would allow
  true inline elements, but it's a sizeable dependency and re-implements undo, paste, IME
  and caret handling. If later work (`$` selections, Roadmap #14) needs richer input, that
  decision can be revisited.

### 10. The `@` list

The filter matches a query against the name with `Intl.Collator`-style folding (lowercased,
accents removed with `normalize("NFD")`), keeping the library's order. Results are grouped
by `group` under headings Thinking, Literature and Data (12.5 muted), skipping empty groups.
Each entry is a row with the pill and the description below it in muted `text-meta`, clamped
to one line. The composer keeps a `highlight` index: ↑ and ↓ move it (wrapping), Enter and Tab
pick the highlighted entry, and the index resets to 0 when the query changes. The highlighted
row has the black selected state (DESIGN.md: "Black is selection"), with the pill unchanged.
The list scrolls past about 8 rows. `#` file suggestions keep their current look and gain the
same keyboard highlight.

The grouping and filtering is a pure function, `miniMeSuggestions(miniMes, query)` in
`protocol/references.ts`, so it can be unit-tested.

### 11. Reaction tooltips with a Base UI Tooltip

The shadcn Tooltip component (built on Base UI, already a dependency) is added with the
shadcn CLI and restyled to DESIGN.md's popover. A reaction shows it on hover and focus,
listing each reactor as their `MiniMePill`, or "You". The native `title` is removed.

### 12. `group` in the library

`MiniMeGroup` is a Rust enum (`Thinking`, `Literature`, `Data`) serialised lowercase, required
on `MiniMe` (no `serde(default)`), so a missing or unknown group fails the library load with
serde's error naming the field. `MiniMeSummary` carries it, and the UI's `MiniMe` type gains
`group: "thinking" | "literature" | "data"`. `builtin.json` sets every Mini-Me's group as the
`mini-mes` spec lists.

## Risks / Trade-offs

- **The composer layer can drift from the text box** if a style differs between them (font
  features, scrollbar width, padding). → Both take their typography from one shared class
  string; the text box hides its scrollbar gutter (`scrollbar-gutter: stable` on both). Checked
  by hand with long text, wrapped mentions and scrolling.
- **Re-parsing long streaming replies** costs time on each chunk. → Parsing is memoized per
  content; long Conversations freezing (#20) is a separate issue and isn't made worse for
  finished messages.
- **Rewriting Text Components as links** can misplace one if its offsets don't match the
  content. → The core already rejects out-of-range offsets; the rewrite skips any component
  whose range doesn't hold its label.
- **Models write some Markdown that renders oddly** (for example a line starting with `1.`
  that wasn't meant as a list). → Accepted; this is how Markdown reads everywhere.
- **New dependencies** must be installed on each machine. → The user runs `npm install`; the
  lockfile pins them.
