# Mini-Me — Design Guide

Local-first desktop research tool (Windows, macOS, Linux) for CIP scientists studying potato late blight. Users talk to **Mini-Mes**: small scientists built from **Traits** and **Workflows** (step graphs).

Reference screens: `Mini-Me Screens.dc.html` (Overview, Conversation, Report, Settings, Mini-Me editor, Trait editor).

---

## 1. Principles

1. **Monochrome UI, colour means a Mini-Me.** Chrome is black, white and greys. Saturated colour only appears when it identifies a Mini-Me or a Trait, so users learn "yellow = Data Wrangler".
2. **Black is selection.** Every selected state (nav item, tab, chip, toolbar button, text selection) is solid `#0A0A0A` with white text. No accent-coloured selection, no tinted hover.
3. **Hairlines, not boxes.** Structure comes from 1px `#E7E7E7` borders and whitespace. Avoid filled cards, heavy shadows and nested containers.
4. **Personality lives in the potatoes.** The wordmark and potato icons carry the warmth. Everything else stays quiet and precise.
5. **Plain, short copy.** Sentence case, no jargon, no exclamation marks. Talk like a helpful lab colleague: "Needs your approval", "Changes apply to both."

---

## 2. Colour

### Neutrals
| Token | Hex | Use |
|---|---|---|
| `--ink` | `#0A0A0A` | Primary text, selection fill, primary buttons, icons on white |
| `--ink-2` | `#3D3D3D` | Body copy, secondary icons |
| `--muted` | `#8A8A8A` | Meta text, timestamps, labels, inactive icons |
| `--muted-on-ink` | `#B8B8B8` | Secondary text on black (selected rows) |
| `--border-strong` | `#CFCFCF` / `#D9D9D9` | Outline pills, composer border |
| `--border` | `#E7E7E7` | Default hairline, card and input borders |
| `--surface-2` | `#F5F5F4` | Table header rows, neutral chips, info blocks, doc panel background |
| `--surface-1` | `#FAFAFA` | Canvas backgrounds (workflow graph), subtle banners |
| `--bg` | `#FFFFFF` | App background |

### Mini-Me colours
Each Mini-Me has a **tint** (backgrounds, chips), a **solid** (dots, borders, chart series, underlines) and an **ink** (text on the tint, ≥4.5:1). For example (Not necessarily real Mini-Mes):

| Mini-Me | Tint | Solid | Ink |
|---|---|---|---|
| Data Wrangler | `#FFF0C2` | `#F5B800` | `#7A5A00` |
| Literature Scout | `#FFE1D8` | `#FF5A36` | `#B3300F` |
| Trial Planner | `#E3DFFF` | `#6E5BFF` | `#4A3AE0` |
| Field Data Checker | `#D9F2E3` | `#2FA36B` | `#1E7A4A` |

New Mini-Mes pick from this family: a light tint, a vivid solid and a darkened ink, all at the same hue. Generate them in `oklch` so lightness stays consistent.

### Trait colours
Traits use one mid-tone solid per trait, with white line glyphs on top. Example: Clean tabular data `#F07206`, Check data quality `oklch(0.52 0.12 340)`, Read tabular data `oklch(0.55 0.1 230)`, Make chart `oklch(0.55 0.11 140)`, Search literature `oklch(0.5 0.1 260)`. Keep L ≈ 0.45–0.6 and C ≈ 0.05–0.12 so white strokes stay legible.

### Status
- Success / connected: `#2FA36B` dot. Never colour the whole row.
- Destructive: `#B3300F` text only ("Remove step").
- Off / not connected: `#CFCFCF` dot.

### Where Mini-Me colour is allowed
- @-mention chips (tint background, ink text, glyph on the left)
- Output thumbnails in Overview (tint fill + 3px solid bottom border)
- Workflow start/end nodes (tint fill, solid border, ink text)
- Chart series produced by that Mini-Me
- Edits made by a Mini-Me inside a document (tint background + 2px solid underline)
- Swatches and "used by" chips in editors

Never use Mini-Me colour for page backgrounds, headers or generic buttons.

---

## 3. Typography

| Role | Family | Notes |
|---|---|---|
| UI + content | **Schibsted Grotesk** 400/500/600/700 | Everything inside the app |
| Wordmark | Schibsted Grotesk (outlined SVG) | `Mini-Me Wordmark.svg`, never retype it |
| Numbers in tables | Schibsted + `font-variant-numeric: tabular-nums` | |

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
- **Sidebar:** 264px wide, 12px side padding, items `7px 10px`.
- **Content widths:** conversation column 760px max (540px when the document panel is open); Overview column 820px.

| Radius | Use |
|---|---|
| 5–6px | Checkboxes, comment markers, small tiles |
| 7px | Nav items, icon buttons, toolbar buttons |
| 8px | Buttons, inputs, selects |
| 10px | Cards, tables, panels, popovers |
| 14px | Chat bubbles, composer |
| 999px | Chips, pills, toggles, status tags |

**Elevation:** almost none.
- Cards: border only.
- Composer: `0 4px 16px rgba(0,0,0,.04)`.
- Floating toolbars / popovers: `0 6px 20px rgba(0,0,0,.10)` + 1px border.
- Screen/window: `0 1px 2px rgba(0,0,0,.06), 0 12px 40px rgba(0,0,0,.08)`.

---

## 5. Iconography

- **UI icons:** 16×16 viewBox, stroke 1.4, round caps and joins, `fill: none`. Rendered at 13–18px. Colour `#8A8A8A` (inactive), `#3D3D3D` (default) or `#0A0A0A` / `#FFFFFF` (active). Lucide is close enough to use with shadcn: set `strokeWidth={1.4}` and size 16.
- **Mini-Me glyphs:** solid potato in the Mini-Me's colour with a simple face. Sizes: 16 (inline chip), 18 (sidebar stack), 20–26 (message author), 28–30 (headers), 36 (editor title). Overlap stacks by about 25% (`margin-left: -5px` at 18px, `-7px` at 28–30px).
- **Trait icons:** potato silhouette filled with the trait colour plus a white line glyph (stroke 1.3). Sizes: 28 (lists), 30 (nodes and inspector), 34 (editor title).
- No emoji in the UI chrome. Emoji are allowed only as user reactions.

---

## 6. Components (shadcn mapping)

Start from the shadcn defaults and apply these overrides. Suggested CSS variables:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 4%;          /* #0A0A0A */
  --muted: 60 5% 96%;             /* #F5F5F4 */
  --muted-foreground: 0 0% 54%;   /* #8A8A8A */
  --border: 0 0% 91%;             /* #E7E7E7 */
  --input: 0 0% 91%;
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
- `outline`: white, 1px `#E7E7E7`, ink text. This is the most common button.
- `ghost`: icon buttons 28–32px square, radius 7.
- `destructive`: text-only red link style, no red fill.
- Only one black button per header.

**Input / Select / Textarea:** 1px `#E7E7E7`, radius 8, padding `7px 12px`, 13.5px. Select uses an up/down chevron icon. Focus: 1px `#0A0A0A` border, no glow ring.

**Switch:** 34×20 track, 16px thumb. On is `#0A0A0A`, off is `#DCDCDC`.

**Checkbox:** 18px, radius 5. Checked is black with a white check.

**Badge / Chip**
- Neutral: `#F5F5F4` fill + `#E7E7E7` border, 999 radius, 13–14px.
- Outline: white, `#CFCFCF` border ("Testing").
- Selected / solid: black fill, white text ("Supported", active filters).
- Mini-Me mention: tint fill, ink text, 16px glyph, padding `1px 8px 1px 3px`.
- Reference chips (#asset, table cell, document passage): neutral chip + leading 13px icon. Document refs read `Section · “quoted text”` and truncate with an ellipsis.

**Tabs:** text tabs with a 2px black underline on the active tab (`box-shadow: inset 0 -2px 0 #0A0A0A`). Inactive tabs are muted. No pill tabs.

**Sidebar / Nav:** white background with a right hairline. The active item is black with white text. Section labels are 12.5/500 muted with a `+` action on the right. Unread or needs-attention items get a 7px dot in the Mini-Me's solid colour and status text in its ink colour.

**Card:** 1px border, radius 10, no shadow, `overflow: hidden`. Output cards have a 72px tinted thumbnail and a 3px solid bottom border in the owner's colour.

**Table:** container border radius 10. Header row is `#F5F5F4`, 12.5 muted. Rows are 13.5 tabular-nums separated by hairlines. A flagged or referenced row gets the Mini-Me tint plus `inset 3px 0 0 <solid>`. The footer row shows counts and an "Open table →" link.

**Tooltip / Popover / Dropdown:** white, 1px border, radius 10, the floating shadow above, 4–5px inner padding, items radius 7. The active item is black.

**Toggle group / Toolbar:** 30px icon buttons, radius 7. The active button is black with a white icon. Groups are separated by 1px × 18px dividers.

---

## 7. Conversation patterns

- **User message:** white, 1px `#E7E7E7` outline, no fill, radius `14 14 4 14`, right-aligned, max-width 560. Meta "You · 10:42" sits below.
- **Mini-Me message:** no bubble. A header row shows the glyph (26px), the name (14.5/600) and the time (muted). Body text is `#3D3D3D` at 15/1.6. Rich outputs (tables, charts, workflow progress) go in bordered cards below.
- **Reactions:** a small white pill overlapping the bubble's bottom-left corner: glyph + emoji.
- **Workflow progress:** a bordered card with steps in a row. Done steps are a black circle with a check, the running step is a spinner in the Mini-Me's solid colour, and pending steps are a grey outline circle.
- **Composer:** border `#D9D9D9`, radius 14, soft shadow. Placeholder: "Ask a Mini-Me, or type @ to choose one…". Tool icons sit at the bottom left and a 32px black circular send button at the bottom right.

### Comment threads (Report / document mode)
- A comment anchors to a passage the way a reference chip anchors to a table cell.
- **In the document:** anchored text gets a `#F3F3F1` fill and a 1.5px dashed `#9A9A9A` underline. The active anchor gets `#ECECE9` and a 2px solid black underline. A numbered **comment marker** follows inline: 18px, radius `6 6 6 2` (a speech-bubble corner). The active marker is black with a white number; inactive markers are white with a black outline.
- **In chat:** the thread head shows the same marker (20px), the reference chip and a "Resolve" outline pill. Replies sit below, indented, with a **2px `#E7E7E7` vertical line** (`margin-left: 9px; padding-left: 19px`). Inside a thread, user bubbles are left-aligned with radius `4 14 14 14`, and authors get 20px avatars.
- **Mini-Me edits** show as a diff card ("Edit · Summary ¶1" + Undo). The inserted text is highlighted in the Mini-Me's tint with a 2px solid underline, in both the card and the document.
- When the composer is replying in a thread, it shows a "Replying in thread" chip with the marker and a dismiss ×.

### Document panel
- Right panel, 640px wide, `#F5F5F4` background, white page (radius 8, border, padding 32–48).
- The header shows the doc icon, title, and "Draft n · saved locally · n comments", plus Export (outline) and close.
- A formatting toolbar sits under the header: undo | heading, bold, italic, list, link | highlight, comment | "Show comments".
- **Text selection** is black with white text. A floating toolbar above the selection offers Rewrite / Comment / Highlight / Ask.

---

## 8. Workflow editor

- The canvas is `#FAFAFA` with an 18px dot grid (`#E2E2E2`).
- Nodes are white, radius 10, 1px border, 56px tall, and show the trait icon, name (14/600) and a meta line (model · tools).
- Start/end nodes are pills in the Mini-Me's tint with a solid border.
- Connectors are 1.25px `#BDBDBD` orthogonal lines. Branch labels ("Yes"/"No") are 11.5 muted.
- The inspector on the right is 320px, with a hairline on its left edge.

---

## 9. Motion

Keep motion minimal and functional: 120–160ms ease-out for hover and selection, 200ms for panels sliding in. Spinners rotate in the Mini-Me's solid colour. No bouncy or decorative animation, except optional small idle wiggles on potato glyphs.

---

## 10. Don'ts

- No gradients (except the white fade at the top of the scrolling message list).
- No coloured primary buttons and no blue links. Links are ink-coloured and drop to 70% opacity on hover.
- No left-border accent cards and no heavy drop shadows.
- Don't use Mini-Me colour for anything a Mini-Me didn't make.
- No uppercase labels, no emoji in chrome, no Inter or Roboto.
