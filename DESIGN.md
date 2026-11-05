# Mini-Me — Design Guide

Local-first desktop research tool (Windows, macOS, Linux) for CIP scientists. Users talk to **Mini-Mes**: small scientists built from **Traits** and **Workflows**.

The visual direction is **Floating sheets**: rounded white sheets on a soft grey desk, serif names, and colour that only ever belongs to a Mini-Me. This guide holds the rules for every screen.

---

## 1. Principles

1. **Sheets on a desk.** The window is a soft grey desk. Every area of the app (navigation, the main view, a tool) is a rounded sheet floating on it with a 12px gap. No full-height dividers, no edge-to-edge panels.
2. **The interface is neutral; colour belongs to Mini-Mes.** Chrome is near-black ink, greys and white. Every bit of colour on screen identifies a Mini-Me: its replies, its files, its tasks, its running jobs. If something isn't tied to a Mini-Me, it isn't coloured.
3. **Serif for names, sans for work.** Titles, section headings and names (Projects, Mini-Mes, documents) are set in the serif. Everything users read or type in bulk is in the sans.
4. **Fills and outlines, never shadows.** Group things with soft fills and whitespace. An element gets a 1px outline only when its fill is the same colour as what is behind it, such as a white card on a white sheet; a fill that differs from its background is enough on its own. Dividers between rows and panes, dashed placeholders and focus rings are not outlines and stay.
5. **One tab-switch style everywhere.** A grey well with a white pill for the selected option, for every set of tabs, filters and vertical page lists.
6. **One card per job.** Each kind of card in §7 has exactly one look. Don't invent another.
7. **Personality lives in the potatoes.** Avatars carry the warmth; everything else stays quiet and precise.
8. **Reuse before you build.** Every repeated piece (a card, a chip, a sheet, a row) exists once and is changed in one place, never restyled per use.

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
| `--white` | `#FFFFFF` | `--background`, `--card`, `--popover`: sheets, tool sheets, popovers, the composer, the selected tab pill and navigation row |
| `--fill-soft` | `#F7F7F4` | `--bubble`: your message bubble |
| `--fill` | `#F4F4F1` | `--muted`, `--well`, `--accent`, `--secondary`, `--sidebar`: neutral cards, boards, tab-switch tracks, inputs, secondary buttons, hover on white, the navigation sheet |
| `--fill-strong` | `#ECECE8` | `--well-hover`, `--sidebar-accent`: hover on a fill |
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

### Scale
Use the text tokens, never arbitrary pixel sizes.

| Token | Family | Size / weight | Use |
|---|---|---|---|
| `text-greeting` | serif | 44 / 500, −0.015em | Home greeting |
| `text-sheet-title` | serif | 34 / 500, −0.01em | Sheet titles |
| `text-identity` | serif | 32 / 500 | An editor's identity name |
| `text-column-title` | serif | 28 / 500 | A column page's title; a sheet title while a tool sheet is open |
| `text-nav-project` | serif | 24 / 500 | The Project name in the navigation |
| `text-tool-title` | serif | 24 / 500 | Tool sheet titles |
| `text-card-title` | serif | 23 / 500 | Card names |
| `text-heading` | serif | 20 / 400 | Section headings |
| `text-name` | serif | 17 / 500 | A Mini-Me's name in a reply |
| `text-subheading` | serif | 15 / 400 | Sub-sections and groups |
| `text-body` | sans | 15 / 400, lh 1.6 | Messages and paragraphs |
| `text-document` | sans | 14.5 / 400, lh 1.75 | Document body |
| `text-ui` | sans | 13.5 / 400–500 | Rows, buttons, navigation items, inputs |
| `text-control` | sans | 13 / 500 | Tab-switch options, small buttons, name tags |
| `text-meta` | sans | 12.5 / 400 | Timestamps, counts, captions |

- The serif is never bold (max 500), never uppercase, never below 15px.
- No uppercase labels or letter-spaced eyebrows. Section labels are serif headings in sentence case.
- Tabular numerals in tables, counts and durations.
- Titles balance their lines; paragraphs wrap prettily.

---

## 5. Shape, spacing, depth

| Token | Value | Use |
|---|---|---|
| desk gap | 12px | Around and between sheets |
| `rounded-sheet` | 18px | Sheets, library cards |
| `rounded-card` | 16px | Cards and boards |
| `rounded-2xl` | 14px | Rows inside cards, Workflow nodes, inspector cards |
| `rounded-well` | 12px | Tab-switch tracks, inputs, search fields, popovers |
| `rounded-control` | 9px | Tab-switch pills, icon buttons |
| `rounded-full` | 999px | Buttons, chips, name tags, a Workflow's start and end, marker pills |
| `rounded-composer` | 20px | The floating composer |
| bubble | `14 14 4 14` | Your messages |

**Depth: none.** No box shadows, on anything. Sheets stand out by sitting on the grey desk; everything else is told apart by fills, and by 1px outlines where a fill matches its background. A selected node gets an ink border and a 4px outline in its Mini-Me's tint.

Option tiles (avatar parts, swatches) are circles or rounded squares, never pill-stretched ovals.

Sheet padding: 32px left, 24–28px top. Tool sheets: 22px top, 18px right, 24px left. Base unit 2px; common steps 4, 6, 8, 10, 12, 14, 16, 20, 24, 32.

---

## 6. Layout

```
┌ desk ───────────────────────────────────────────────────────┐
│ ┌ nav 256 ┐ ┌ main sheet (flex) ──────────┐ ┌ tool 340–380 ┐ │
│ │         │ │                             │ │              │ │
│ └─────────┘ └─────────────────────────────┘ └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

- **Navigation sheet, 256px.** The wordmark (it leads Home), the open Project or a dashed placeholder when none is open, the Project's views, its Conversations, status lines, and a bottom card with the Mini-Mes and your initials. The selected item is a white row.
- **Main sheet, flexible.** The view being worked on.
- **Tool sheet, 340–380px.** A tool beside the main sheet. Only one at a time; a well-filled close button sits top-right.
- **Content widths.** A chat column is 820px, or 680px with a tool sheet open; its composer spans it and its messages sit 20px inside. A column page (settings, notes) is a 210px list and content up to 760px, centred together.
- **Small windows.** When a tool sheet opens below ~1280px, the navigation collapses to a 64px rail of icons, each at the same distance from the edge as when open, so the main view keeps ≥600px. Closing the tool sheet opens it again, unless the user opened it meanwhile.

---

## 7. Components

Always build from shadcn/ui components. Add a missing one from shadcn/ui rather than writing it from scratch, and change its styling wherever it differs from this guide.

### Cards
- **Neutral card:** `--muted` fill, 1px `--border`, `rounded-card`. For things that belong to no Mini-Me.
- **White card:** a white fill with an outline, for rows that hold well-filled buttons or inputs, so they don't sink into the fill. Related items share one white card, divided by hairlines, rather than a card each.
- **Mini-Me card:** `wash` fill, 1px `edge`, `rounded-card`, with the Mini-Me's colours available to its content. Without a Mini-Me it renders as a neutral card. For anything a Mini-Me made or is doing.
- White things on the sheet (tables, paper sources, progress cards, buttons) are outlined on the white sheet and not inside a card or reply, whose own fill sets them apart.

### Tab switch
Track `--well`, radius 12, padding 4, gap 4. Option: 13/500, padding 7×12, radius 9, optional 15px icon. Selected: white fill, 1px `--border`, ink text. Unselected: `--ink-2`, no fill. Vertical lists use padding 5 and options 9×11.

### Buttons
- **Default:** ink fill, white text, pill, 13.5/500. Only one ink button per header.
- **Secondary / outline:** `--well` fill, ink text, pill.
- **Mini-Me:** white, with a 1px `edge` outline only on white.
- **Ghost:** no fill; icon buttons 30×30, radius 9.
- **Destructive:** red text only, no fill.

### Inputs
Inputs, text areas and selects: `--well` fill, no visible border, radius 12, 13.5px; focus shows a 1px ink border. Rows with inputs or well buttons sit on a white card, not a grey one.

### Name tags and chips
- **Mini-Me name tag:** the Mini-Me's `tint` with its `ink` text and avatar; 16px avatar inline, 24px under a title, where it can add a status after a gap at 80% opacity.
- **Reference chip:** one chip for every file, table and chart, wherever it appears: white, outlined, an optional 13px leading icon, and a button when it opens what it names.

### Sheets and headers
Every sheet, tool sheet, page header, section heading and editor header comes from one shared set: a serif title, an optional meta line, actions on the right, and a close button on a tool sheet.

### Rows and lists
- Flat rows divided by hairlines, filling `--muted` on hover. A row leads with its avatar, sign or icon, then the name (truncated), with a count or time right-aligned in meta.
- A file's icon is in its maker's `ink`, or `ink-2` for your files, with no tile.
- A list of Mini-Mes is a grid of cards; a list of Traits is rows.

### Replies and messages
- **Reply:** a Mini-Me card, padding 16×18. Header: 28px avatar, serif name, time and status in `ink`. Body 15px. Action pills are Mini-Me buttons; an active one is solid ink.
- **Your message:** right-aligned, max 520px, `--bubble` fill without an outline, the bubble radius, the time below.
- **Reactions:** a small white outlined pill over the bubble's bottom-left corner: avatar and emoji.
- **Composer:** floats 22px above the bottom of the sheet. White, 1px outline (the addressed Mini-Me's `edge`, else `--border`), radius 20; a 34px round send button in the Mini-Me's `ink`, else ink. The list above keeps enough bottom padding for its last item to clear it.
- **Fade:** the only gradient: 56px from the sheet's white to transparent at the top of a message list.

### Progress and timelines
Steps share one set of marks everywhere: done is an ink circle with a check; running is a spinner in the Mini-Me's `solid`; pending is a white circle with a grey ring. A vertical timeline joins them with a 1.5px connector, ink when done.

### Long-form text
- A document's source is a white page on `--muted`, in monospace `text-ui` and `--document-ink`, with Markdown highlighted in theme colours. A rendered preview shows white pages up to 640px wide on `--muted`.
- A passage someone commented on has a `--border-strong` underline and a number badge; the selected one fills with `--accent`. A suggested edit strikes the passage through and follows it with the new text in the Mini-Me's `ink`, underlined 2px in its `solid`.

### Popovers, tooltips, menus
White, 1px `--border`, radius 12, no shadow. Items radius 7; the highlighted item is `--accent`, never black. A confirmation is a popover under its button, aligned to its right edge: the question, a ghost Keep holding the focus, and a destructive action. A popover that reports a result holds one solid button to act on it.

---

## 8. Iconography

### UI icons
Lucide, outlined, stroke 1.4, 15–18px. Colour `--muted-foreground` (inactive), `--ink-2` (default) or ink (active). No filled variants.

### Mini-Me avatars (solid style)
A flat potato in the Mini-Me's **solid** colour. No outline, no background disc. Features are near-black; freckles use the Mini-Me's **ink**. Built from base, face and accessory parts plus a colour family. Never redraw avatars by hand.

Sizes: 16 (inline chip), 18–22 (stacks, Workflow start and end, rows), 24 (name tags), 28 (reply header), 40 (prominent rows), 48 (editor header), 56 (library card). Stacks overlap by about a third.

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
- No outline where a fill already sets an element apart, and no new kind of card beyond those in §7.
- No coloured UI chrome: no brand accent, no coloured links, no coloured selection. Links are ink and drop to 70% opacity on hover.
- No uppercase labels, letter-spaced eyebrows or status pills above titles.
- No coloured left-border accents on cards.
- No gradients other than the message-list fade.
- No bold serif, no serif for body text, no serif below 15px.
- Don't use a Mini-Me's colour for anything that Mini-Me didn't make.
- No more than one tool sheet at once.
- No arbitrary font sizes or colours outside the tokens; no fonts loaded from the web; no more than two font families.
- No separator characters between details, and no detail the screen already shows.
