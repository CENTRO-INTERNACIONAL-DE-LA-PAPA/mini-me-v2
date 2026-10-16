# Mini-Me — Design Guide

Local-first desktop research tool (Windows, macOS, Linux) for CIP scientists studying potato late blight. Users talk to **Mini-Mes**: small scientists built from **Traits** (skills) and **Workflows** (step graphs).

Reference files:
- `Mini-Me Screens.dc.html`: Exploration 13 (Overview, Conversation, Report, Settings, Mini-Me editor, Trait editor)
- `Mini-Me Glyph.dc.html`: the Mini-Me avatar component (solid style)
- `Mini-Me Avatars.dc.html`: avatar parts explorer (style **1b Solid** is the chosen one)

---

## 1. Principles

1. **Calm, warm monochrome; colour means a Mini-Me.** Chrome is near-black, warm off-whites and warm greys. Saturated colour only appears when it identifies a Mini-Me or a Trait, so users learn "yellow = Data Wrangler".
2. **Black is selection.** Every selected state (nav item, tab, chip, toolbar button, text selection) is solid `#0A0A0A` with white text. No accent-coloured selection, no tinted hover.
3. **Three surfaces, one rule.** Sidebar `#F7F7F5` → workspace `#FCFCFA` → anything with a border `#FFFFFF`. Never pure white as a page background, never a bordered element without a white fill.
4. **Hairlines, not boxes.** Structure comes from 1px warm hairlines (`#E7E6E1`) and whitespace. Avoid heavy shadows and nested containers.
5. **Personality lives in the potatoes.** Mini-Me avatars and trait icons carry the warmth. Everything else stays quiet and precise.
6. **Plain, short copy.** Sentence case, no jargon, no exclamation marks. Talk like a helpful lab colleague: "Needs your approval", "Changes apply to both."

---

## 2. Colour

### Surfaces
| Token | Hex | Use |
|---|---|---|
| `--sidebar` | `#F7F7F5` | App sidebar, document panel header and formatting toolbar |
| `--bg` | `#FCFCFA` | Workspace (main area, headers, inspectors, message-list fade) |
| `--card` | `#FFFFFF` | **Every bordered element**: cards, tables, message bubbles, composer, inputs, selects, outline buttons, chips, popovers, workflow nodes, document page, sidebar project card |
| `--surface-2` | `#F5F5F4` | Table header rows, neutral filled chips, info blocks, document panel background |
| `--canvas` | `#FAFAF8` | Workflow canvas, with an 18px dot grid in `#DEDCD5` |

Rule of thumb: if it has a border, it is `#FFFFFF`. If it is flush with the window, it is `#FCFCFA` (workspace) or `#F7F7F5` (sidebar).

### Ink and lines
| Token | Hex | Use |
|---|---|---|
| `--ink` | `#0A0A0A` | Primary text, selection fill, primary buttons, icons |
| `--ink-2` | `#3D3D3D` | Body copy, secondary icons |
| `--muted` | `#8A8A8A` | Meta text, timestamps, labels, inactive icons |
| `--muted-on-ink` | `#B8B8B8` | Secondary text on black (selected rows) |
| `--border-strong` | `#D0CFC9` / `#D9D8D2` | Outline pills, composer border, pending-step rings |
| `--border` | `#E7E6E1` | Default hairline, card and input borders, dividers |
| `--line-soft` | `#E3E2DC` / `#F1F0EB` | Chart gridlines, faint separators |
| `--connector` | `#BFBDB6` | Workflow connectors |

All greys are warm-shifted by a hair so they sit with the sidebar. Don't mix in pure neutral greys (`#E7E7E7`, `#FAFAFA`…): next to the warm surfaces they read as blue.

### Mini-Me colours
Each Mini-Me has a **tint** (backgrounds, chips), a **solid** (avatar body, dots, borders, chart series, underlines) and an **ink** (text on the tint, ≥4.5:1).

| Mini-Me | Tint | Solid | Ink |
|---|---|---|---|
| Data Wrangler | `#FFF0C2` | `#F5B800` | `#7A5A00` |
| Literature Scout | `#FFE1D8` | `#FF5A36` | `#B3300F` |
| Trial Planner | `#E3DFFF` | `#6E5BFF` | `#4A3AE0` |
| Field Data Checker | `#D9F2E3` | `#2FA36B` | `#1E7A4A` |

Extra families available to new Mini-Mes (same structure, generated in `oklch`): teal 205, pink 350, blue 250, brown 55. Tint L≈0.94 C≈0.04, solid L≈0.6–0.68 C≈0.1–0.19, ink L≈0.42–0.48.

### Trait colours
Traits use one bright fill per trait (same family as the Mini-Me solids) with a **black** line glyph on top. Keep L ≈ 0.74–0.84 and C ≈ 0.06–0.15 so black strokes stay legible.

| Trait | Fill |
|---|---|
| Clean tabular data | `oklch(0.76 0.15 55)` |
| Check data quality | `oklch(0.76 0.14 345)` |
| Read tabular data | `oklch(0.78 0.11 230)` |
| Summarise findings | `oklch(0.84 0.13 95)` |
| Make chart | `oklch(0.8 0.14 145)` |
| Search literature | `oklch(0.74 0.12 270)` |
| Plan layout | `oklch(0.74 0.06 60)` |
| Translate | `oklch(0.8 0.1 190)` |

Avoid trait hues that collide with a Mini-Me solid in the same view.

### Status
- Success / connected: `#2FA36B` dot. Never colour the whole row.
- Destructive: `#B3300F` text only ("Remove step").
- Off / not connected: `#D0CFC9` dot.

### Where Mini-Me colour is allowed
- Avatars (body fill)
- @-mention chips (tint background, ink text, avatar on the left)
- Output thumbnails in Overview (tint fill + 3px solid bottom border)
- Chart series produced by that Mini-Me
- Edits made by a Mini-Me inside a document (tint background + 2px solid underline)
- Needs-attention dots and status text in the sidebar
- Swatches and "used by" chips in editors

Never use Mini-Me colour for page backgrounds, headers, generic buttons or workflow start/end nodes.

---

## 3. Typography

One typeface, so only one font family needs bundling.

| Role | Family | Notes |
|---|---|---|
| UI + content | **Schibsted Grotesk** 400/500/600/700 | Everything inside the app |
| Wordmark | Schibsted Grotesk (outlined SVG) | `Mini-Me Wordmark.svg`, never retype it |
| Numbers in tables | Schibsted + `font-variant-numeric: tabular-nums` | |

A second family is allowed later (e.g. a monospace for raw data), but no more than two in total.

### Scale (desktop, px)
| Role | Size / weight / tracking | Line height |
|---|---|---|
| Display (Overview title) | 46 / 700 / -0.035em | 1.02 |
| Page title (editor headers) | 24–26 / 700 / -0.02em | 1.15 |
| Document title | 27 / 700 / -0.025em | 1.15 |
| Header title (conversation) | 18 / 700 / -0.015em | 1.2 |
| Section heading | 15–17 / 600–700 / -0.01em | 1.3 |
| Lead paragraph | 18 / 400, `#3D3D3D` | 1.6 |
| Body / messages | 15 / 400 | 1.6 |
| Document body | 14.5 / 400, `#2A2A2A` | 1.75 |
| UI default (nav, buttons, inputs) | 13.5 / 400–500 | 1.4 |
| Meta / labels | 12–12.5 / 400–500, `#8A8A8A` | 1.4 |

- Use `text-wrap: balance` on titles and `text-wrap: pretty` on paragraphs.
- Field labels are 12.5 / 500 / muted and sit above the control. No uppercase eyebrows.

---

## 4. Spacing, radius, elevation

- **Base unit 2px**, common steps: 4, 6, 8, 10, 12, 14, 16, 20, 24, 32.
- **Page padding:** 32px horizontal in headers and main areas, 22–24px in inspectors.
- **Sidebar:** 264px wide, `#F7F7F5`, 1px `#E7E6E1` right hairline, 12px side padding, items `7px 10px`.
- **Content widths:** conversation column 760px max (540px when the document panel is open); Overview column 820px.

| Radius | Use |
|---|---|
| 5–6px | Checkboxes, comment markers, small tiles |
| 7px | Nav items, icon buttons, toolbar buttons |
| 8px | Buttons, inputs, selects |
| 10px | Cards, tables, panels, popovers, workflow nodes |
| 14px | Chat bubbles, composer |
| 999px | Chips, pills, toggles, status tags, workflow start/end |

**Elevation:** almost none. White-on-`#FCFCFA` already gives a slight lift.
- Cards: border only.
- Workflow nodes and start/end pills: `0 1px 2px rgba(0,0,0,.04)`.
- Composer: `0 4px 16px rgba(0,0,0,.04)`.
- Floating toolbars / popovers: `0 6px 20px rgba(0,0,0,.10)` + 1px border.
- Screen/window: `0 1px 2px rgba(0,0,0,.06), 0 12px 40px rgba(0,0,0,.08)`.

---

## 5. Iconography

### UI icons
16×16 viewBox, stroke 1.4, round caps and joins, `fill: none`. Rendered at 13–18px. Colour `#8A8A8A` (inactive), `#3D3D3D` (default) or `#0A0A0A` / `#FFFFFF` (active). Lucide is close enough to use with shadcn: set `strokeWidth={1.4}` and size 16. UI icons stay outlined; don't use filled variants.

### Mini-Me avatars (solid style)
A flat potato in the Mini-Me's **solid** colour. No outline, no background disc. Features are `#0A0A0A`; freckles use the Mini-Me's **ink**. Use the `Mini-Me Glyph` component; never redraw avatars by hand.

Every avatar is built from five parts:
| Part | Options |
|---|---|
| Body | Potato, Pebble, Bean |
| Eyes | Dots, Happy (arcs), Calm (lines) |
| Mouth | None, Smile, Oh, Flat |
| Accessory | None, Glasses, Sprout, Beret, Sun hat (all solid `#0A0A0A`) |
| Colour | Any Mini-Me colour family |

Defaults: Data Wrangler (potato, dots, smile, sprout, yellow) · Literature Scout (potato, dots, no mouth, glasses, coral) · Trial Planner (bean, dots, flat, beret, violet) · Field Data Checker (pebble, happy, smile, sun hat, green).

Sizes: 16 (inline chip), 18 (sidebar stack, workflow start/end), 20–26 (message author), 28–30 (headers), 36 (editor title). Overlap stacks by about 25% (`margin-left: -5px` at 18px, `-7px` at 28–30px). Feature strokes are 0.95 in a 24-unit box, so details stay crisp down to 16px.

### Trait icons
Same potato silhouette as the avatars, filled with the trait's bright colour, with a **black** line glyph on top (stroke 1.25, round caps and joins, 24-unit box). No face: a face means a Mini-Me. Sizes: 28 (lists), 30 (nodes and inspector), 34 (editor title).

No emoji in the UI chrome. Emoji are allowed only as user reactions.

---

## 6. Components (shadcn mapping)

Start from the shadcn defaults and apply these overrides. Suggested CSS variables:

```css
:root {
  --background: 60 14% 99%;       /* #FCFCFA workspace */
  --sidebar: 60 9% 97%;           /* #F7F7F5 */
  --card: 0 0% 100%;              /* #FFFFFF, all bordered elements */
  --popover: 0 0% 100%;
  --foreground: 0 0% 4%;          /* #0A0A0A */
  --muted: 60 5% 96%;             /* #F5F5F4 */
  --muted-foreground: 0 0% 54%;   /* #8A8A8A */
  --border: 50 9% 89%;            /* #E7E6E1 */
  --input: 50 9% 89%;
  --primary: 0 0% 4%;
  --primary-foreground: 0 0% 100%;
  --secondary: 0 0% 100%;
  --secondary-foreground: 0 0% 4%;
  --accent: 60 5% 96%;            /* hover only */
  --accent-foreground: 0 0% 4%;
  --ring: 0 0% 4%;
  --destructive: 12 85% 38%;      /* #B3300F */
  --radius: 0.5rem;               /* 8px */
}
```

**Button**
- `default`: black fill, white text, 13.5/500, padding `8px 14px`, radius 8.
- `outline`: `#FFFFFF` fill, 1px `#E7E6E1`, ink text. This is the most common button.
- `ghost`: icon buttons 28–32px square, radius 7, no fill.
- `destructive`: text-only red link style, no red fill.
- Only one black button per header.

**Input / Select / Textarea:** `#FFFFFF`, 1px `#E7E6E1`, radius 8, padding `7px 12px`, 13.5px. Select uses an up/down chevron icon. Focus: 1px `#0A0A0A` border, no glow ring.

**Switch:** 34×20 track, 16px white thumb. On is `#0A0A0A`, off is `#DCDBD5`.

**Checkbox:** 18px, radius 5, white with a `#E7E6E1` border. Checked is black with a white check.

**Badge / Chip**
- Neutral filled: `#F5F5F4` fill + `#E7E6E1` border, 999 radius, 13–14px.
- Outline: `#FFFFFF`, `#D0CFC9` border ("Testing").
- Selected / solid: black fill, white text ("Supported", active filters).
- Mini-Me mention: tint fill, ink text, 16px avatar, padding `1px 8px 1px 3px`.
- Reference chips (#asset, table cell, document passage): neutral chip + leading 13px icon. Document refs read `Section · “quoted text”` and truncate with an ellipsis.

**Tabs:** text tabs with a 2px black underline on the active tab (`box-shadow: inset 0 -2px 0 #0A0A0A`). Inactive tabs are muted. No pill tabs.

**Sidebar / Nav:** `#F7F7F5` background with a right hairline. The project switcher is a white bordered card. The active item is black with white text. Section labels are 12.5/500 muted with a `+` action on the right. Unread or needs-attention items get a 7px dot in the Mini-Me's solid colour and status text in its ink colour.

**Card:** `#FFFFFF`, 1px border, radius 10, no shadow, `overflow: hidden`. Output cards have a 72px tinted thumbnail and a 3px solid bottom border in the owner's colour.

**Table:** white container, border radius 10. The header row is `#F5F5F4`, 12.5 muted. Rows are 13.5 tabular-nums separated by hairlines. A flagged or referenced row gets the Mini-Me tint plus `inset 3px 0 0 <solid>`. The footer row shows counts and an "Open table →" link.

**Charts:** sit on a white bordered card (never directly on the workspace). Gridlines `#F1F0EB`, axis `#0A0A0A`, labels 11px muted, baseline series `#D7D6D0`, Mini-Me series in its solid.

**Tooltip / Popover / Dropdown:** white, 1px border, radius 10, the floating shadow above, 4–5px inner padding, items radius 7. The active item is black.

**Toggle group / Toolbar:** 30px icon buttons, radius 7. The active button is black with a white icon. Groups are separated by 1px × 18px dividers.

---

## 7. Conversation patterns

- **User message:** `#FFFFFF` bubble, 1px `#E7E6E1` outline, radius `14 14 4 14`, right-aligned, max-width 560. Meta "You · 10:42" sits below.
- **Mini-Me message:** no bubble, text sits on the workspace. A header row shows the avatar (26px), the name (14.5/600) and the time (muted). Body text is `#3D3D3D` at 15/1.6. Rich outputs (tables, charts, workflow progress) go in white bordered cards below.
- **Reactions:** a small white pill overlapping the bubble's bottom-left corner: avatar + emoji.
- **Workflow progress:** a white bordered card with steps in a row. Done steps are a black circle with a check, the running step is a spinner in the Mini-Me's solid colour, and pending steps are a white circle with a 1.5px `#D0CFC9` ring.
- **Composer:** `#FFFFFF`, border `#D9D8D2`, radius 14, soft shadow. Placeholder: "Ask a Mini-Me, or type @ to choose one…". Tool icons sit at the bottom left and a 32px black circular send button at the bottom right.
- **Message-list fade:** the only gradient allowed, from `#FCFCFA` to transparent at the top of the scrolling list.

### Comment threads (Report / document mode)
- A comment anchors to a passage the way a reference chip anchors to a table cell.
- **In the document:** anchored text gets a `#F3F3F1` fill and a 1.5px dashed `#9A9A9A` underline. The active anchor gets `#ECECE9` and a 2px solid black underline. A numbered **comment marker** follows inline: 18px, radius `6 6 6 2` (a speech-bubble corner). The active marker is black with a white number; inactive markers are white with a black outline.
- **In chat:** the thread head shows the same marker (20px), the reference chip and a "Resolve" outline pill. Replies sit below, indented, with a **2px `#E7E6E1` vertical line** (`margin-left: 9px; padding-left: 19px`). Inside a thread, user bubbles are left-aligned with radius `4 14 14 14`, and authors get 20px avatars.
- **Mini-Me edits** show as a white diff card ("Edit · Summary ¶1" + Undo). The inserted text is highlighted in the Mini-Me's tint with a 2px solid underline, in both the card and the document.
- When the composer is replying in a thread, it shows a "Replying in thread" chip with the marker and a dismiss ×.

### Document panel
- Right panel, 640px wide, `#F5F5F4` background, white page (radius 8, border, padding 32–48).
- The header (`#F7F7F5`) shows the doc icon, title, and "Draft n · saved locally · n comments", plus Export (outline) and close.
- A formatting toolbar (`#F7F7F5`) sits under the header: undo | heading, bold, italic, list, link | highlight, comment | "Show comments".
- **Text selection** is black with white text. A floating white toolbar above the selection offers Rewrite / Comment / Highlight / Ask.

---

## 8. Workflow editor

- The canvas is `#FAFAF8` with an 18px dot grid (`#DEDCD5`).
- Nodes are white, radius 10, 1px `#E7E6E1` border, a 1px soft shadow, 56px tall, and show the trait icon (30px), name (14/600) and a meta line (model · tools).
- **Start/end nodes** ("When invoked", "Reply in conversation") are white pills: 32px tall, 1px `#E7E6E1` border, the owning Mini-Me's 18px avatar on the left, 12.5/500 ink text. No tint fill.
- Branch and parallel markers ("Issues found?", "In parallel") are white pills with a hairline.
- Connectors are 1.25px `#BFBDB6` orthogonal lines. Branch labels ("Yes"/"No") are 11.5 muted.
- The inspector on the right is 320px on the workspace colour, with a hairline on its left edge.

---

## 9. Motion

Keep motion minimal and functional: 120–160ms ease-out for hover and selection, 200ms for panels sliding in. Spinners rotate in the Mini-Me's solid colour. No bouncy or decorative animation, except optional small idle wiggles on avatars.

---

## 10. Dark mode (planned)

The surface stack maps directly: sidebar ≈ `#161614`, workspace ≈ `#1C1C1A`, bordered elements ≈ `#232320`, hairlines ≈ `#2E2D2A`. Selection inverts to a light fill with dark text. Avatars and trait icons keep their fills and black features. Mini-Me tints need dark variants, and ink text on dark should use lighter versions of each Mini-Me colour (e.g. Trial Planner `#A99DFF`).

---

## 11. Don'ts

- No pure white page backgrounds and no pure neutral greys; use the warm stack above.
- No bordered element without a `#FFFFFF` fill.
- No gradients (except the message-list fade).
- No coloured primary buttons and no blue links. Links are ink-coloured and drop to 70% opacity on hover.
- No left-border accent cards and no heavy drop shadows.
- Don't use Mini-Me colour for anything a Mini-Me didn't make.
- No filled UI icons, no white glyphs on trait icons, no faces on trait icons.
- No more than two font families. No uppercase labels, no emoji in chrome, no Inter or Roboto.
