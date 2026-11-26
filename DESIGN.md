# Mini-Me — Design Guide

Local-first desktop research tool (Windows, macOS, Linux) for CIP scientists. Users talk to **Mini-Mes**: small scientists built from **Traits** and **Workflows**.

The visual direction is **Floating sheets**: rounded white sheets on a soft grey desk, serif names, and colour that only ever belongs to a Mini-Me. This guide holds the rules for every screen.

---

## 1. Principles

1. **Sheets on a desk.** The window is a soft grey desk. Every area of the app (navigation, the main view, a tool) is a rounded sheet floating on it with a 12px gap. No full-height dividers, no edge-to-edge panels.
2. **The interface is neutral; colour belongs to Mini-Mes.** Chrome is near-black ink, greys and white. Every bit of colour on screen identifies a Mini-Me: its replies, its files, its tasks, its running jobs. If something isn't tied to a Mini-Me, it isn't coloured.
3. **Serif for names, sans for work.** Titles, section headings and names (Projects, Mini-Mes, documents) are set in the serif. Everything users read or type in bulk is in the sans.
4. **Height says what a thing does, never shadows.** Raised white, outlined in a 1px hairline, is something you press or pick: buttons and the selected option. Sunk grey holds something: text you type, or a setting that is switched on. Sheets, cards and boards group things with fills. The one ink fill is the main action. Dividers between rows and panes, dashed placeholders and focus rings are not outlines and stay.
5. **Three states, three looks.** *Selected* (where you are, one of a group) is a raised white pill. *On* (a setting switched on) is pressed in: `--well-hover` fill, no outline. *Disabled* fades the whole control to 40% and changes nothing else.
6. **One tab-switch style everywhere.** A grey well with a white pill for the selected option, for every set of tabs, filters and vertical page lists.
7. **One card per job.** Each kind of card in §7 has exactly one look. Don't invent another.
8. **Personality lives in the potatoes.** Avatars carry the warmth; everything else stays quiet and precise.
9. **Reuse before you build.** Every repeated piece (a card, a chip, a sheet, a row) exists once and is changed in one place, never restyled per use.

---

## 2. Writing

- **Plain and short.** Sentence case, no jargon, no exclamation marks. Talk like a helpful lab colleague: "Needs your approval", "Changes apply to both."
- **Only what the screen doesn't already say.** Leave out what the user can see or already knows where they are: the Project they are in, the name of the view they are looking at, a count that a tab or heading already shows, a kind that an icon already shows. "50 files (7.4 MB)", not "50 files in Test, 18 made by Mini-Mes, 7.4 MB".
- **Every part reads on its own.** A detail without context needs a word that says what it is: "From Trial design", "Edited Nov 2", not a bare name or date.
- **Capital first letter.** Every label, status, note and action starts with a capital letter: "Edited Nov 2", "Passage not found", "Duplicate to customise".
- **Secondary detail in parentheses.** A detail that qualifies the main text follows it in parentheses: "data.csv (2.1 MB)", "Trial design (Huancayo)", "Searching papers (42%)".
- **No separator characters.** Never join parts with a middle dot, bullet or slash. Two independent details on one line, such as a time and a status, are kept apart by a small gap.
- **Names are the app's own.** Use the glossary's terms (Project, Conversation, Mini-Me, Trait, Workflow, Step, Files) everywhere.

---

## 3. Colour

All UI colours come from one palette of eleven neutrals and two status colours. Every other token names a role and points at a palette entry, so a theme only redefines the palette (and the Mini-Me colours derive from each Mini-Me). Add a role by pointing a new token at the palette, never by adding a value.

### Palette
| Entry | Hex | Roles |
|---|---|---|
| `--white` | `#FFFFFF` | `--background`, `--card`, `--popover`: sheets, tool sheets, white cards, popovers, the composer, secondary buttons, the selected tab pill and navigation row |
| `--fill-soft` | `#F7F7F4` | `--bubble`: your message bubble |
| `--fill` | `#F4F4F1` | `--muted`, `--well`, `--accent`, `--secondary`, `--sidebar`: neutral cards, boards, tab-switch tracks, inputs, hover on white, the navigation sheet |
| `--fill-strong` | `#ECECE8` | `--well-hover`, `--sidebar-accent`: hover on a fill, a pressed (on) toggle |
| `--desk` | `#E9E9E5` | The window background behind all sheets |
| `--line` | `#E7E7E4` | `--border`, `--input`: every outline, on white things on white |
| `--line-strong` | `#D3D3CE` | `--border-strong`, `--dash`, `--canvas-dot`, `--off`: dashed "new" tiles, empty states, a board's dots, switches when off |
| `--ink` | `#191B1E` | `--foreground`, `--primary`: titles, primary text, primary buttons, checked boxes |
| `--ink-2` | `#3A3E44` | `--document-ink`: icons, unselected tab labels, secondary copy, long-form text |
| `--ink-muted` | `#6A6E74` | `--muted-foreground`: meta text, timestamps, placeholders (≥4.5:1 on white and on `--fill`) |
| `--ink-faint` | `#B8B8B3` | `--chev`, `--connector`: row chevrons, connectors between Steps |
| `--destructive` | `#B3300F` | Destructive text only ("Remove step") |
| `--success` | `#2FA36B` | Connected and running status dots only |

Charts take their neutrals from the same palette. Their categorical series have their own colours, and series beyond them get generated colours of the same lightness and chroma.

### Mini-Me colours
Each Mini-Me stores three colours; the UI derives two more.

| Role | Stored? | Use |
|---|---|---|
| `tint` | stored | Avatar background, chips and name tags, highlights |
| `solid` | stored | Avatar body, chart series, spinners |
| `ink` | stored | Text and icons on its surfaces, progress fill, the send button when addressed (≥4.5:1 on wash and tint) |
| `wash` | derived | The very light background of its cards: replies, tasks, jobs, library cards |
| `edge` | derived | The 1px outline of its white cards and buttons on white; dropped on a surface of another colour |

`wash` and `edge` come from the hue of `solid`, in OKLCH: **wash** L 0.985 C 0.015, **edge** L 0.86 C 0.07. A new colour family picks a hue; tint L≈0.94 C≈0.04, solid L≈0.6–0.68 C≈0.1–0.19, ink L≈0.42–0.48. Check ink on wash and on tint before shipping. Outside any Mini-Me, the same roles fall back to the neutral values, so one component works in both places.

### Colour rules
- Never use a Mini-Me colour for anything the user did. Your bubbles, files and tasks are neutral.
- A composer addressed to a Mini-Me is outlined in its `edge` and sends with its `ink`. With no Mini-Me picked it is neutral.
- Warnings inside a reply (review suggestions, flagged values) use that Mini-Me's `tint` and `ink`, not a global warning colour. Passed checks stay neutral.
- Only one Mini-Me's colour per surface. A tile with several Mini-Mes shows overlapping avatars, not mixed colours.
- Never use Mini-Me colour for page backgrounds, generic buttons or a Workflow's start and end.

---

## 4. Typography

Two families, bundled with the app and never loaded from the web.

| Role | Family |
|---|---|
| Titles, headings, names | Plantin, falling back to **Source Serif 4** (bundled, since Plantin needs a licence), then Georgia |
| Everything else | **Schibsted Grotesk** |
| Wordmark | Always the wordmark artwork; never retype it |

Schibsted Grotesk is declared in `index.css` with its ascent at 91% and descent at 32.5%, so text sits centred in its line box and an icon beside it lines up. Keep these when the font is updated.

### Scale
Use the text tokens, never arbitrary pixel sizes.

| Token | Family | Size / weight | Use |
|---|---|---|---|
| `text-greeting` | serif | 44 / 500, −0.015em | Home greeting |
| `text-sheet-title` | serif | 34 / 500, −0.01em | Sheet titles |
| `text-identity` | serif | 32 / 500 | An editor's identity name |
| `text-column-title` | serif | 28 / 500 | A column page's title; a sheet title while a tool sheet is open |
| `text-tool-title` | serif | 24 / 500 | Tool sheet titles, card names |
| `text-heading` | serif | 20 / 400 | Section headings |
| `text-name` | serif | 17 / 500 | A Mini-Me's name in a reply |
| `text-subheading` | serif | 15 / 400–500 | The Project's name in the navigation |
| `text-body` | sans | 15 / 400, lh 1.6 | Messages and paragraphs |
| `text-document` | sans | 14.5 / 400, lh 1.75 | Document body |
| `text-ui` | sans | 13.5 / 400–500 | Rows, buttons, navigation items, inputs |
| `text-control` | sans | 13 / 500 | Tab-switch options, small buttons, name tags |
| `text-meta` | sans | 12.5 / 400 | Timestamps, counts, captions |

- The serif is never bold (max 500), never uppercase, never below 15px.
- No uppercase labels or letter-spaced eyebrows. Serif names a page, a thing or a page section: page titles, names (Projects, Mini-Mes, documents), and a page's sections (`text-heading`). Anything that groups content inside a card, a tool sheet, the navigation or an editor takes the small label instead, the same as a form field's label: `text-ui` 500 in ink, sentence case.
- Tabular numerals in tables, counts and durations.
- Titles balance their lines; paragraphs wrap prettily.

---

## 5. Shape, spacing, depth

| Class | Value | Use |
|---|---|---|
| `p-3 gap-3` | 12px | The desk: around and between sheets |
| `rounded-2xl rounded-br-sm` | 16px, 4px bottom right | Your message bubble |

**Radius** follows from what a thing is, on Tailwind's own scale:

| What | Radius |
|---|---|
| Containers: sheets, cards, boards, the composer | `rounded-2xl` (16px) |
| Floating layers: popovers, menus, select lists, tooltips | `rounded-xl` (12px) |
| Fields and content boxes: inputs, selects, search fields, code blocks, Workflow nodes, thumbnails, document pages | `rounded-xl` (12px) |
| Anything pressed on its own: buttons, icon buttons, chips, name tags | `rounded-full` |
| Items picked from a list or track: tab-switch pills, menu and select items, navigation rows, list rows | `rounded-lg` (8px), which is also a 12px track or menu minus its 4px padding |
| Small marks: checkboxes, inline code, comment number badges | `rounded-sm` (4px) |

Fields stay rectangles and buttons stay round, so the two never look alike.


**Depth: none.** No box shadows, on anything. Sheets stand out by sitting on the grey desk; everything else is told apart by fills and by the hairline on raised white things (§1.4). A selected node or tile on a canvas or grid of white tiles gets a 1px ink border; a Trait Step takes its Mini-Me's `solid` instead.

Option tiles (avatar parts, swatches) are circles or rounded squares, never pill-stretched ovals.

**Spacing** uses one scale: 2, 4, 8, 12, 16, 24 and 32px (`0.5 1 2 3 4 6 8`). Row and item padding keeps 10px (`px-2.5`). Each job has one value:

| Job | Value |
|---|---|
| Icon or avatar beside its text, in a control or row | 8px (`gap-2`); 4px in badges and `xs` buttons |
| Identity mark (18px icon, 28px+ avatar) before a card's text | 12px (`gap-3`) |
| Siblings in a row (buttons, chips) | 8px; 4px in packed toolbars and tab tracks |
| A title against its actions | 16px |
| Name over its meta line | 2px |
| Title over description, label over hint | 4px |
| Blocks inside a card or reply | 12px |
| Form fields | 24px |
| Cards in a grid or column | 12px |
| Sections of a page | 24px |
| Columns of a page | 32px |
| Card padding | 20px, or 16px for a small card, a reply or a coloured list item; bands inside a card 16 × 8px |
| Page padding | 32px at the sides, 24px top, 32px bottom, for every main page, Home and Settings; 24px for tool sheets |
| Control heights | 24 (`xs`), 32 (`sm`), 36px (default) |

Values that make room for something (a checkmark, a row's "…" button, a list indent) are not spacing and follow what they make room for. Arbitrary `[…px]` values are kept for fixed layout widths only.

---

## 6. Layout

```
┌ desk ───────────────────────────────────────────────────────┐
│ ┌ nav 256 ┐ ┌ main sheet (flex) ──────────┐ ┌ tool 340–380 ┐ │
│ │         │ │                             │ │              │ │
│ └─────────┘ └─────────────────────────────┘ └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

- **Navigation sheet, 256px.** The wordmark (it leads Home); the app's rows, Home and Mini-Mes (an avatar stack that hops on hover); the open Project's name as a serif group heading with a ⌄ for its menu, or a dashed placeholder when none is open, above its views; its views: Overview, Files and a Conversations row with a + for a new one, which expands to the Conversations behind a thin guide line, as one-line rows, a running or waiting row ending in its Mini-Me's 22px avatar; status lines, and a full-width Settings row at the bottom. The selected item is a white row.
- **Main sheet, flexible.** The view being worked on.
- **Tool sheet, 340–380px.** A tool beside the main sheet. Only one at a time; a well-filled close button sits top-right.
- **Content widths.** A chat column is 820px, or 680px with a tool sheet open; its composer spans it and its messages sit 20px inside. A column page (settings, notes) is a 210px list and content up to 760px, centred together.
- **Small windows.** When a tool sheet opens below ~1280px, the navigation collapses to a 64px rail of icons, each at the same distance from the edge as when open, so the main view keeps ≥600px. Closing the tool sheet opens it again, unless the user opened it meanwhile.

---

## 7. Components

Always build from shadcn/ui components. Add a missing one from shadcn/ui rather than writing it from scratch, and change its styling wherever it differs from this guide.

### Cards
- **Neutral card:** `Card`, `--muted` fill, `rounded-2xl`. For things that belong to no Mini-Me.
- **White card:** `Card variant="outline"`, a white fill with an outline, for rows that hold inputs, so the grey fields don't sink into a grey card. Related items share one white card, divided by hairlines, rather than a card each.
- **Mini-Me card:** `wash` fill, 1px `edge`, `rounded-2xl`, with the Mini-Me's colours available to its content. Without a Mini-Me it renders as a neutral card. For anything a Mini-Me made or is doing.
- **Padding:** a card pads itself, `p-5`, or `p-4` with `size="sm"`; a card with full-width bands sets `p-0`.
- **Interactive Component card:** `ComponentCard`, a small white card; a title, actions and a footer note sit in bands divided by hairlines, and the body (a table, a chart) runs to its edges.
- **Result card:** `ResultCard`, a search result (a paper, a dataset) in a `ComponentCard`: its title, which opens the result, a byline and a description. Only the title opens it; the card holds other controls.

### Tab switch
One style for tabs and toggle groups (`ToggleGroup`'s `plain` variant is for items that draw themselves, such as colour swatches). Track `--well`, `rounded-xl p-1 gap-1`. Option: `text-control` 500, `px-3 py-2`, `rounded-lg`, optional `size-4` icon. Selected: white fill, 1px `--border`, ink text. Unselected: `--ink-2`, no fill. Vertical lists use `p-1.5` and options `px-3 py-2.5`.

### Buttons
- **Default:** ink fill, white text, pill, 13.5/500. Only one ink button per header.
- **Secondary:** white, 1px hairline, ink text, pill; filled on hover. On a Mini-Me's surface its outline drops and it fills halfway to that Mini-Me's `tint` on hover and with the `tint` when pressed, since its `wash` would hide it. One button serves both places.
- **Ghost:** no fill; icon buttons are `size-7.5` circles.
- **Toggle:** any of these with `aria-pressed`. On, it is pressed in: `--well-hover` fill (a Mini-Me's `tint` on its surface), no outline. Never ink, which is kept for the main action.
- **Destructive:** red text only, no fill.
- **Link:** text only, normal weight, underlined on hover; for links inside text and table cells.

### Inputs
Inputs, text areas and selects: `--well` fill, no visible border, `rounded-xl`, `text-ui`; focus shows a 1px `--muted-foreground` border, the lightest grey that keeps 3:1 against the fill. A field is the shadcn `Field`: a `text-ui` 500 label, a `text-meta` hint in `--muted-foreground` and any error in `--destructive`. In forms and inspectors the control sits under them (`LabelledField`); in Settings rows it sits on the right. A search field is `SearchInput`: a leading search icon, 240px wide. A slider is the shadcn `Slider`: a round white thumb with an ink ring; its track can take a gradient (`--slider-track`), as the avatar hue does.

### Name tags and chips
- **Mini-Me name tag:** the Mini-Me's `tint` with its `ink` text and avatar; 16px avatar inline, 24px under a title, where it can add a status after a gap at 80% opacity.
- **Origin badge:** "Built-in" or "Yours", an outline badge in the Mini-Me's `ink`.
- **Your initials:** the shadcn `Avatar`, `size="sm"`: a grey circle with the initials in `text-meta`.
- **Reference chip:** one chip for every file, table and chart, wherever it appears: white, outlined, an optional 13px leading icon, and a button when it opens what it names.

### Sheets and headers
Every sheet, tool sheet, page header, section heading and editor header comes from one shared set: a serif title, an optional meta line, actions on the right, and a close button on a tool sheet. A page's actions sit at the end of its title's line (`HeaderActions`), 32px from the sheet's edge, on every page.
- **Page:** `SheetPage`, or `PageTitle` where the page sits in a column (Settings): `text-sheet-title`, a `text-ui` line under it, actions on the right.
- **Section:** `SheetSection`: a `text-heading` serif title, short meta (a count) beside it, an optional sentence under it in `text-meta`, actions on the right.
- **Tool sheet group:** `ToolSheetGroup`: a small label (`text-ui` 500) over its rows, groups `mt-6` apart.
- **Editor:** `EditorHeader`, then its content padded by `EDITOR_BODY` (`px-8 pt-6 pb-8`).

### Rows and lists
- Flat rows divided by hairlines, filling `--muted` on hover (`ListRow`, `rounded-lg px-2 py-2`). A one-line row is 36px tall, the same as a navigation row; a meta line makes it taller. A row leads with its avatar, sign or icon, then the name (truncated, `text-ui` 500) over an optional meta line, with a count, time or actions on the right.
- Tables are `ui/table`: a `--muted` header row in `text-meta`, cells `px-3 py-2`, rows divided by hairlines.
- A file's icon is in its maker's `ink`, or `ink-2` for your files, with no tile.
- A list of Mini-Mes is a grid of cards; a list of Traits is rows.

### Replies and messages
- **Reply:** a Mini-Me card, `p-4`. Header: 28px avatar, serif name, time and status in `ink`. Body 15px. Action pills are secondary buttons; an active one is pressed in, in the Mini-Me's `tint`.
- **Your message:** right-aligned, max 520px, `--bubble` fill without an outline, `rounded-2xl rounded-br-sm`, the time below.
- **Reactions:** a small white outlined pill over the bubble's bottom-left corner: avatar and emoji.
- **Composer:** floats `bottom-5.5` above the bottom of the sheet. White, 1px outline (the addressed Mini-Me's `edge`, else `--border`), `rounded-2xl`; a `size-8.5` round send button in the Mini-Me's `ink`, else ink. The list above keeps enough bottom padding for its last item to clear it.
- **Fade:** the only gradient: 56px from the sheet's white to transparent at the top of a message list.

### Status, errors and empty states
- **Status dot:** `StatusDot`, an 8px circle, green when on, `--off` otherwise; before a status line or a label such as "Connected".
- **Error:** `ErrorText`, one `text-meta` line in `--destructive`, spaced by its container.
- **Empty state:** the shadcn `Empty` with an `EmptyDescription`: centred `text-ui` in `--muted-foreground`, with room around it. One size everywhere, from an empty list to an empty Conversation.

### Workflow canvas
Nodes are told apart by who acts. A Trait Step is the Mini-Me's work: a Mini-Me card. A Step you take (an approval) is a white card with a hairline. Flow Steps (start, end, conditions, loops) only route: outline-only pills in `--border-strong`, no fill. Every node is 220px wide and keeps its label on one line. Connectors drop, turn once just above their target, and enter it.

### Progress and timelines
Steps share one set of marks everywhere: done is an ink circle with a check; running is a spinner in the Mini-Me's `solid`; pending is a white circle with a grey ring. A vertical timeline joins them with a 1.5px connector, ink when done.

### Long-form text
- A document's source is a white page on `--muted`, in monospace `text-ui` and `--document-ink`, with Markdown highlighted in theme colours. A rendered preview shows white pages up to 640px wide on `--muted`.
- A passage someone commented on has a `--border-strong` underline and a number badge; the selected one fills with `--accent`. A suggested edit strikes the passage through and follows it with the new text in the Mini-Me's `ink`, underlined 2px in its `solid`.

### Popovers, tooltips, menus
Hover hints are tooltips (`Hint`), never the browser's `title`: white, 1px `--border`, `rounded-xl`, `text-meta`, after a 400ms first delay; an icon button's hint repeats its `aria-label`. A disabled control's hint sits on a wrapper (`Hint disabled`). The navigation's rows show theirs only when it is collapsed to icons.

White, 1px `--border`, `rounded-xl`, no shadow. Items `rounded-lg`; the highlighted item is `--accent`, never black. A confirmation is a popover under its button, aligned to its right edge: the question, a ghost Keep holding the focus, and a destructive action (`ConfirmButton`, or `ConfirmActions` inside a popover that already exists). Nothing asks inline. A popover that reports a result holds one solid button to act on it.

---

## 8. Iconography

### UI icons
Lucide, outlined, stroke 1.4 (set once for every icon). Five sizes, by role:

| Size | Use |
|---|---|
| 12px (`size-3`) | A glyph inside a mark: the check in a done Step, the stop square, the + on a drop target |
| 14px (`size-3.5`) | Beside small text: chips, `xs` buttons, chevrons |
| 16px (`size-4`) | Everything else: buttons, rows, menus, tabs, inputs, Workflow pills. Components size their icons to this, so an icon needs no class |
| 18px (`size-4.5`) | The identity icon leading a card or Trait: a Trait's icon, a Workflow Step card, a hand-off or document card |
| 24px (`size-6`) | A feature icon standing alone: an editor header, a drop zone |

Colour `--muted-foreground` (inactive), `--ink-2` (default) or ink (active). No filled variants.

### Mini-Me avatars (solid style)
A flat potato in the Mini-Me's **solid** colour. No outline, no background disc. Features are near-black; freckles use the Mini-Me's **ink**. Built from one part per layer (base, eyes, mouth, and optionally an accessory and a held item) plus a colour family. Never redraw avatars by hand.

Sizes: 16 (inline, in text or a table cell), 22 (stacks and one-line rows), 24 (name tags, Workflow start and end), 28 (reply headers, two-line rows, status cards), 40 (prominent rows), 48 (editor header), 56 (library card). Nothing in between. Stacks overlap by about a third.

### Trait icons
Plain line icons in ink, no fill, no colour, no potato silhouette (a potato always means a Mini-Me). Icons stand on their own: never on a filled or tinted tile.

No emoji in the UI chrome. Emoji are allowed only as user reactions.

---

## 9. Motion

Minimal and functional: 120–160ms ease-out for hover and selection, 200ms for sheets opening. Spinners rotate in the Mini-Me's solid colour. No bouncy or decorative animation, except optional small idle wiggles on avatars. Everything respects reduced motion.

---

## 10. Dark mode (planned)

Map the stack: desk darkest, sheets one step up, cards one more, outlines just above them. Selection inverts to a light pill with dark text. Avatars keep their fills and dark features. Mini-Me tints, washes and edges need dark variants; ink on dark uses lighter versions of each Mini-Me colour.

---

## 11. Don'ts

- No box shadows, anywhere.
- No new kind of card beyond those in §7, and no ink fill except the main action.
- No coloured UI chrome: no brand accent, no coloured links, no coloured selection. Links are ink and drop to 70% opacity on hover.
- No uppercase labels, letter-spaced eyebrows or status pills above titles.
- No coloured left-border accents on cards.
- No gradients other than the message-list fade.
- No bold serif, no serif for body text, no serif below 15px.
- Don't use a Mini-Me's colour for anything that Mini-Me didn't make.
- No more than one tool sheet at once.
- No arbitrary font sizes or colours outside the tokens; no fonts loaded from the web; no more than two font families.
- No separator characters between details, and no detail the screen already shows.
