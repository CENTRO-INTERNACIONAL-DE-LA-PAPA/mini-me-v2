# Mini-Me — Design Guide

Local-first desktop research tool (Windows, macOS, Linux) for CIP scientists studying potato late blight. Users talk to **Mini-Mes**: small scientists built from **Traits** and **Workflows** (Step graphs).

The visual direction is **Floating sheets**: rounded white sheets on a soft grey desk, serif names, and colour that only ever belongs to a Mini-Me.

Reference files (Claude Design project):
- `Mini-Me Screens.dc.html`, section **Floating sheets**, screens F01–F15
- `Mini-Me Glyph.dc.html`: the Mini-Me avatar component (solid style)
- `Mini-Me Brand.dc.html`: app icon ideas, wordmark and default Mini-Mes, banners

| # | Screen | # | Screen |
|---|---|---|---|
| F01 | Home (no project) | F09 | Report (always full width) |
| F02 | Overview | F10 | Files |
| F03 | Conversation | F11 | Settings |
| F04 | Conversation · Review | F12 | Mini-Mes library |
| F05 | Conversation · To-do | F13 | Traits library |
| F06 | Conversation · Background jobs | F14 | Mini-Me editor |
| F07 | Conversation · Workflow | F15 | Trait editor |
| F08 | Conversation · Report, pick a document | | |

Design files are a reference, not the source of names: the app's own names win (the design's "Drive" is **Files**).

---

## 1. Principles

1. **Sheets on a desk.** The window is a soft grey desk. Every area of the app (navigation, the main view, a tool) is a rounded sheet floating on it with a 12px gap. No full-height dividers, no edge-to-edge panels.
2. **The interface is neutral; colour belongs to Mini-Mes.** Chrome is near-black ink, greys and white. Every bit of colour on screen identifies a Mini-Me: its replies, its files, its tasks, its running jobs. If something isn't tied to a Mini-Me, it isn't coloured.
3. **Serif for names, sans for work.** Titles, section headings and names (projects, Mini-Mes, documents) are set in the serif. Everything users read or type in bulk is in Schibsted Grotesk.
4. **Fills and outlines, never shadows.** Group things with soft fills and whitespace. Every card is outlined with a 1px line, and anything white or near-white sitting on white gets one. No box shadows anywhere.
5. **One tab-switch style everywhere.** A grey well with an outlined white pill for the selected option: tool tabs, filters, library tabs, editor tabs, avatar part tabs and the Settings column.
6. **One card per job.** Each kind of card in §6 has exactly one look. Don't invent another.
7. **Personality lives in the potatoes.** Avatars carry the warmth; everything else stays quiet and precise.
8. **Plain, short copy.** Sentence case, no jargon, no exclamation marks. Talk like a helpful lab colleague: "Needs your approval", "Changes apply to both."

---

## 2. Colour

All UI colours come from the tokens in `src/index.css`. No other palette.

### Desk and surfaces
| Token | Hex | Use |
|---|---|---|
| `--desk` | `#E9E9E5` | Window background behind all sheets |
| `--background` / `--card` | `#FFFFFF` | Sheets, tool sheets, popovers, composer, selected tab pill |
| `--sidebar` | `#F7F7F4` | Navigation sheet |
| `--muted` | `#F7F7F4` | Neutral cards inside a sheet, your message bubble, icon tiles, the Workflow board |
| `--well` | `#F4F4F1` | Tab-switch track, inputs and selects, secondary and close buttons |
| `--well-hover` | `#ECECE8` | Hover on well-filled buttons |
| `--canvas-dot` | `#D0D0CA` | 18px grid of 3px dots on the Workflow board |

### Ink and lines
| Token | Hex | Use |
|---|---|---|
| `--foreground` | `#191B1E` | Titles, primary text, primary buttons, checked boxes, avatar initials |
| `--document-ink` | `#2B2E32` | Long-form body text |
| `--ink-2` | `#3A3E44` | Icons, unselected tab labels, secondary copy |
| `--muted-foreground` | `#6A6E74` | Meta text, timestamps, placeholders (≥4.5:1 on white and on `--well`) |
| `--border` | `#E7E7E4` | Every outline: cards, tables, nav selection, tab pill, popovers |
| `--dash` / `--border-strong` | `#D3D3CE` | Dashed "new" tiles, empty states, hover on outlined cards |
| `--chev` | `#B8B8B3` | Row chevrons |
| `--connector` | `#B8B8B3` | Workflow connectors |
| `--destructive` | `#B3300F` | Destructive text only ("Remove step") |
| `--success` | `#2FA36B` | Connected / running status dots only |

### Mini-Me colours
Each Mini-Me stores three colours; the UI derives two more.

| Role | Stored? | Use |
|---|---|---|
| `tint` | stored | Avatar background, chips and name tags, icon tiles for files it made, report highlights |
| `solid` | stored | Avatar body, chart series, spinners |
| `ink` | stored | Text and icons on its surfaces, progress fill, send button when addressed (≥4.5:1 on wash and tint) |
| `wash` | derived | Very light background of its cards: replies, tasks, jobs, library cards |
| `edge` | derived | The 1px outline of its cards, and of white buttons and tables inside them |

`wash` and `edge` are computed in `src/components/minime/miniMeColors.ts` from the hue of `solid`, in OKLCH: **wash** L 0.985 C 0.015, **edge** L 0.86 C 0.07. New colour families pick a hue; tint L≈0.94 C≈0.04, solid L≈0.6–0.68 C≈0.1–0.19, ink L≈0.42–0.48. Check ink on wash and on tint before shipping.

**Using them in code.** `surfaceStyle(colors)` sets `--mm-tint`, `--mm-solid`, `--mm-ink`, `--mm-wash` and `--mm-edge` on an element. Inside it, use the theme classes `bg-wash`, `bg-tint`, `border-edge` and `text-mm-ink`; outside any Mini-Me they fall back to the neutral values, so the same component works in both places.

### Colour rules
- Never use a Mini-Me colour for anything the user did. Your bubbles, files and tasks are neutral.
- A composer addressed to a Mini-Me is outlined in its `edge` and sends with its `ink`. With no Mini-Me picked it is neutral.
- Warnings inside a reply (review suggestions, flagged values) use that Mini-Me's `tint` and `ink`, not a global warning colour. Passed checks stay neutral.
- Only one Mini-Me's colour per surface. A tile with several Mini-Mes shows overlapping avatars, not mixed colours.
- Never use Mini-Me colour for page backgrounds, generic buttons or Workflow start/end nodes.

---

## 3. Typography

Two bundled families, never loaded from the web.

| Role | Family |
|---|---|
| Titles, headings, names | `'Plantin', 'Plantin MT Pro', 'Source Serif 4 Variable', Georgia, serif` (`font-serif`). Plantin needs a Monotype licence, so **Source Serif 4** (OFL, opsz axis) is bundled with the app |
| Everything else | **Schibsted Grotesk** (`font-sans`) |
| Wordmark | `Mini-Me Wordmark.svg`; never retype it |

### Scale
Use the theme's text tokens, never arbitrary pixel sizes. New tokens must also be registered in `src/lib/utils.ts`, or `cn()` drops them.

| Token | Family | Size / weight | Use |
|---|---|---|---|
| `text-greeting` | serif | 44 / 500, −0.015em | Home greeting |
| `text-sheet-title` | serif | 34 / 500, −0.01em | Sheet titles |
| `text-identity` | serif | 32 / 500 | Editor identity name |
| `text-column-title` | serif | 28 / 500 | Settings column title; sheet title while a tool sheet is open |
| `text-nav-project` | serif | 24 / 500 | Project name in the navigation |
| `text-tool-title` | serif | 24 / 500 | Tool sheet title |
| `text-card-title` | serif | 23 / 500 | Project and library card names |
| `text-heading` | serif | 20 / 400 | Section headings: "Waiting on you", "Projects", "Providers" |
| `text-name` | serif | 17 / 500 | Mini-Me name in a reply |
| `text-subheading` | serif | 15 / 400 | Sub-sections: "Conversations" in the navigation, groups in tool sheets |
| `text-body` | sans | 15 / 400, lh 1.6 | Messages and paragraphs |
| `text-document` | sans | 14.5 / 400, lh 1.75 | Document body |
| `text-ui` | sans | 13.5 / 400–500 | Rows, buttons, nav items, inputs |
| `text-control` | sans | 13 / 500 | Tab-switch options, small buttons, name tags |
| `text-meta` | sans | 12.5 / 400 | Timestamps, counts, captions |

- The serif is never bold (max 500), never uppercase, never below 15px.
- No uppercase labels or letter-spaced eyebrows. Section labels are serif headings in sentence case.
- Tabular numerals (`tabular-nums`) in tables, counts and durations.
- `text-wrap: balance` on titles, `pretty` on paragraphs.

---

## 4. Shape, spacing, depth

| Token | Value | Use |
|---|---|---|
| desk gap | 12px | Around and between sheets |
| `rounded-sheet` | 18px | Sheets, library cards, identity tiles |
| `rounded-card` | 16px | Cards: replies, tasks, jobs, project cards, the Workflow board |
| `rounded-2xl` | 14px | Provider rows, Workflow nodes, inspector cards |
| `rounded-well` | 12px | Tab-switch track, inputs, search fields, popovers, 42px icon tiles |
| `rounded-control` | 9px | Tab-switch pill, icon buttons, small icon tiles |
| `rounded-full` | 999px | Buttons, chips, name tags, Workflow start/end and marker pills |
| `rounded-composer` | 20px | Floating composer |
| bubble | `14 14 4 14` | Your messages |

**Depth: none.** No box shadows: not on sheets, pills, popovers, the composer or Workflow nodes. Sheets stand out by sitting on the grey desk; everything else is told apart by fills and 1px outlines. The selected Workflow step gets an ink border and a 4px outline in its Mini-Me's tint.

Option tiles (avatar parts, swatches) are either circles or rounded squares, never pill-stretched ovals.

Sheet padding: 32px left, 24–28px top. Tool sheets: 22px top, 18px right, 24px left. Base unit 2px; common steps 4, 6, 8, 10, 12, 14, 16, 20, 24, 32.

---

## 5. Layout

```
┌ desk #E9E9E5 ───────────────────────────────────────────────┐
│ ┌ nav 256 ┐ ┌ main sheet (flex) ──────────┐ ┌ tool 340–380 ┐ │
│ │         │ │                             │ │              │ │
│ └─────────┘ └─────────────────────────────┘ └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

- **Navigation sheet, 256px.** Wordmark and collapse button; the project block (serif name under a "Project ▾" switcher) or a dashed "No project open" card; Overview and Files; Conversations (serif heading with a + button, then rows); status lines; a bottom card with the Mini-Mes stack (opens the Library) and your initials (open Settings). The selected item is an outlined white row.
- **Main sheet, flexible.** Conversation, Overview, Files, libraries, editors, Settings and the full report.
- **Tool sheet, 340–380px.** Outline, Jobs, Workflow steps, Report picker, the Workflow step inspector. Only one at a time; a well-filled close button sits top-right.
- **Content widths:** the chat column is 820px, or 680px with a tool sheet open. The composer spans it; the messages sit 20px inside it on each side, centred on it. Settings: a 210px column and content up to 760px, centred together.
- **Small windows (to build):** when a tool sheet opens below ~1280px, collapse the navigation sheet to avatars and icons so the conversation keeps ≥600px.

---

## 6. Components

Build from the shadcn/ui components in `src/components/ui`, restyled to this guide; add missing ones with the shadcn CLI. Repeated pieces live in shared components; reuse them rather than repeating class strings.

### Cards
- **Neutral card** (`Card`): `--muted` fill, 1px `--border`, `rounded-card`. Project cards, problem boxes, the avatar preview.
- **White card**: a `Card` with a white fill, for rows that hold well-filled buttons or inputs, so they don't sink into the fill: Settings accounts and keys (`AccountCard`).
- **Mini-Me card** (`MiniMeSurface`): `wash` fill, 1px `edge`, `rounded-card`, with the Mini-Me's `--mm-*` variables set for its content. Without a Mini-Me it renders as a neutral card. Replies, handed-back tasks, running jobs, library cards, "Waiting on you", "Used by".
- Things inside a card that are white (tables, paper sources, the Workflow progress card, buttons) are outlined in `border-edge`.

### Tab switch
`Tabs` / `ToggleGroup` (`variant="switch"`): track `--well`, radius 12, padding 4, gap 4. Option: 13/500, padding 7×12, radius 9, optional 15px icon. Selected: white fill, 1px `--border`, ink text. Unselected: `--ink-2`, no fill. Vertical in Settings (padding 5, options 9×11).

### Buttons
- `default`: ink fill, white text, pill, 13.5/500.
- `secondary` / `outline`: `--well` fill, ink text, pill.
- `mini-me`: white with a 1px `edge` outline (neutral outline outside a Mini-Me).
- `ghost`: no fill; icon buttons 30×30, radius 9.
- `destructive`: red text only, no fill. Only one ink button per header.

### Inputs
Input, Textarea and Select: `--well` fill, no visible border, radius 12, 13.5px; focus shows a 1px ink border. Put rows with inputs or well buttons on a white card, not a grey one.

### Name tags and chips
`MiniMePill`: the Mini-Me's `tint` with its `ink` text and avatar. Inline chips use a 16px avatar; name tags under a Conversation title (`size="tag"`) use 24px and add "· status" at 80% opacity. `ReferenceChip` is the one chip for files, tables and charts everywhere: files attached to or referenced in a message, `#` and `$` references, the composer's attachments, and later document passages. White with an outline and an optional leading 13px icon; a button when it opens what it names. Change it there, never per use.

### Sheets
`MainSheet`, `ToolSheet` (serif title, meta line, close button), `SheetPage` (a page in the main sheet: serif title, description, actions on the right), `SheetHeader` (Conversation title block), `SheetSection` (serif section heading with optional meta and actions), `SectionPage` (Settings), `EditorHeader` (both editors).

### Conversation
- **Reply:** a Mini-Me card, padding 16×18. Header: 28px avatar, serif name (`text-name`), time and status in `ink`. Body 15px. Tables, paper sources and the Workflow progress card sit on white with an `edge` outline. Action pills are `mini-me` buttons; an active one is solid ink.
- **Your message:** right-aligned, max 520px, `--muted` fill with a `--border` outline, bubble radius. Mentioned Mini-Mes appear as tint chips; files as white chips with a hairline. Meta "You · 10:42" below.
- **Reactions:** a small white outlined pill over the bubble's bottom-left corner: avatar + emoji.
- **Composer:** floats 22px above the bottom of the sheet, in the chat column. White, 1px outline (the addressed Mini-Me's `edge`, else `--border`), radius 20. Text row, then @ / # / attach icons and a 34px round send button (the Mini-Me's `ink`, else ink). The message list keeps 150px bottom padding so the last reply clears it.
- **Workflow progress:** a white outlined card with the Steps in a row: done = ink circle with a check; running = spinner in the Mini-Me's solid; pending = white circle with a grey ring. An earlier Step opens to show its output and the components it added.
- **Message-list fade:** the only gradient: 56px from the sheet's white to transparent at the top of the list.

### Tool sheet rows
- Outline: groups for Mini-Mes, Files and Tables and charts; each entry a flat row with a 22px avatar (Mini-Mes) or its `#` / `$` sign, the name (truncated), and the number of messages it appears in, right-aligned in meta. Rows fill `--muted` on hover.
- Jobs: each running reply is a Mini-Me card: 26px avatar, name, "Running <Step>" in `ink`, then "This conversation", or the Conversation and Project, in meta. The open Conversation's reply comes first. The whole card shows the reply.
- Workflow steps: vertical timeline with the same marks as the progress card; connector 1.5px, ink when done.

### Libraries
- Mini-Mes: cards (`MiniMeCard`) in a grid, `rounded-sheet`, 56px avatar, "Built-in"/"Yours" tag, serif `text-card-title` name, description, "N Traits · Open →" in `ink`. Built-in cards are Mini-Me cards; yours are neutral.
- Traits: flat rows divided by hairlines; 42px outlined icon tile, name, description, overlapping avatars of the Mini-Mes that use it.
- Header: title and description on the left; the Mini-Mes / Traits tab switch and the New button on the right. Group filter and search below.

### Files
Flat table rows with hairlines. The icon tile (`FileTile`) is the maker's `tint` with an `edge` outline and `ink` icon, or neutral for your files. "Added by" shows avatar + name in `ink`. Filter tab switch, search on the right.

### Editors
- **Identity header** (`EditorHeader`): a back link, a 64px tile (the Mini-Me's tint, or neutral for a Trait), the serif `text-identity` name and a line under it, then the tab switch and actions on the right.
- **Mini-Me editor:** Workflow / Traits / Appearance tabs. The Workflow board is a neutral card with the dot grid; the step palette floats top-left as an outlined white card; the inspector is a tool sheet that opens when a Step is selected.
- **Trait editor:** form on the left (fields on wells, labels 13/500 `ink-2`), "Used by" on the right with a Mini-Me card per Mini-Me and a note on what saving changes.

### Popovers, tooltips, menus
White, 1px `--border`, radius 12, no shadow. Items radius 7; the highlighted item is `--accent`, never black.

### Report (to build)
- Picker (tool sheet): "Draft from this conversation" (outlined in ink, shows the Mini-Mes it draws from), "Start blank", then recent documents from Files.
- Document (main sheet, always full width): top bar with breadcrumb, formatting buttons, Share, close. Three columns: outline 220px, page (serif title 40, body 16/1.75), comments 280px on `--muted`. Text written from a Mini-Me reply keeps its `tint` highlight with a 2px solid underline; Mini-Me comments use its wash.
- Comment threads anchor to a passage like a reference chip anchors to a table cell. Anchored text gets a `--muted` fill and a dashed underline; the active anchor a solid ink underline. A numbered comment marker follows inline (18px, radius `6 6 6 2`).

---

## 7. Iconography

### App icons
`src-tauri/icons/app-icon.svg` (releases) and `app-icon-dev.svg` (`npm run tauri:dev` only, via `tauri.dev.conf.json`). Regenerate with `npx tauri icon src-tauri/icons/app-icon.svg` and `npx tauri icon src-tauri/icons/app-icon-dev.svg --output src-tauri/icons/dev`, keeping only the files the configs list. The release icon is full bleed (Windows); the dev icon's artwork is inset to an 824px shape on the 1024px canvas, as macOS expects, since dev builds run on macOS.

### UI icons
Lucide, outlined, stroke 1.4 (set globally), 15–18px. Colour `--muted-foreground` (inactive), `--ink-2` (default) or ink (active). No filled variants.

### Mini-Me avatars (solid style)
A flat potato in the Mini-Me's **solid** colour. No outline, no background disc. Features are near-black; freckles use the Mini-Me's **ink**. Built from base, face and accessory parts plus a colour family. Never redraw avatars by hand.

Sizes: 16 (inline chip), 18–22 (stacks, Workflow start/end, Files), 24 (name tags), 28 (reply header), 40 (Waiting on you), 48–56 (editor tile, library card). Stacks overlap by about a third.

### Trait icons
Plain line icons in ink, no fill, no colour, no potato silhouette (a potato always means a Mini-Me), on an outlined neutral tile.

No emoji in the UI chrome. Emoji are allowed only as user reactions.

---

## 8. Motion

Minimal and functional: 120–160ms ease-out for hover and selection, 200ms for sheets opening. Spinners rotate in the Mini-Me's solid colour. No bouncy or decorative animation, except optional small idle wiggles on avatars.

---

## 9. Dark mode (planned)

Map the stack: desk darkest, sheets one step up, cards one more, outlines just above them. Selection inverts to a light pill with dark text. Avatars keep their fills and dark features. Mini-Me tints, washes and edges need dark variants; ink on dark uses lighter versions of each Mini-Me colour.

---

## 10. Don'ts

- No box shadows, anywhere.
- No card without its outline, and no new kind of card beyond those in §6.
- No coloured UI chrome: no brand accent, no coloured links, no coloured selection. Links are ink and drop to 70% opacity on hover.
- No uppercase labels, letter-spaced eyebrows or status pills above titles.
- No coloured left-border accents on cards.
- No gradients other than the message-list fade.
- No bold serif, no serif for body text, no serif below 15px.
- Don't use a Mini-Me's colour for anything that Mini-Me didn't make.
- No more than one tool sheet at once; no report editor in a side sheet.
- No arbitrary font sizes or colours outside the tokens; no fonts loaded from the web; no more than two font families.
