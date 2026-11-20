# Design

## Context

See proposal.md for the motivation. The work is entirely in the UI process; the Rust core and
the sidecar are untouched, and no durable state changes.

Today `src/index.css` redefines Tailwind's radius scale (`rounded-xs` 5px, `sm` 6px, `md` 7px,
`xl` 10px, `2xl` 14px) and adds five role radii (`control` 9px, `well` 12px, `card` 16px,
`sheet` 18px, `composer` 20px), so a class name does not mean what Tailwind documents. The
shadcn primitives in `src/components/ui/` were restyled one by one; `toggle` and
`toggle-group` were not. Shared app components already exist in `shell/Sheet.tsx`
(`MainSheet`, `ToolSheet`, `SheetHeader`, `SheetPage`, `SheetSection`, `ToolSwitch`),
`shell/StatusRow.tsx`, `shell/ItemMenu.tsx` and `library/LibraryParts.tsx`, but most views
do not use them.

## Goals / Non-Goals

**Goals:**
- Every role (card, row, field, error, empty state, header, confirmation, hint) is drawn by one
  component, and every view uses it.
- A Tailwind class means what Tailwind documents; no arbitrary `[…px]` values remain outside
  the few the design needs (bubble corner, fixed layout widths).

**Non-Goals:**
- Changing what any view shows or does.
- Matching today's pixel values exactly.

## Decisions

All decisions below were settled with the user.

1. **One change, one PR.** Tasks are grouped A (primitives and tokens), B (small parts),
   C (fields and confirmations), D (cards, rows, tables), E (page shells and headers),
   F (tooltips), done in that order because each group builds on the one before.
2. **shadcn first.** A role uses a shadcn component when one fits, added with the shadcn CLI
   and restyled to DESIGN.md. A custom component is written only when no shadcn component fits,
   or fitting one would mean rewriting much of its file. New shadcn components: `field`
   (label, description, error), `empty` (empty states), `avatar` (initials) and `slider` (the
   hue control in the avatar colour picker).
3. **Stock Tailwind radii.** The overrides and role radii are removed. Roles map to:

   | Role | Was | Now |
   |---|---|---|
   | Menu and select items | `rounded-md` 7px | `rounded-md` (6px) |
   | Icon buttons, tab-switch pills | `rounded-control` 9px | `rounded-lg` (8px) |
   | Inputs, wells, popovers, tab-switch tracks | `rounded-well` 12px | `rounded-xl` (12px) |
   | Rows in cards, Workflow nodes | `rounded-2xl` 14px | `rounded-xl` (12px) |
   | Cards, sheets, library cards | `rounded-card` 16px, `rounded-sheet` 18px | `rounded-2xl` (16px) |
   | Composer | `rounded-composer` 20px | `rounded-2xl` (16px) |
   | Buttons, chips, name tags | `rounded-full` | `rounded-full` |

   Arbitrary spacing (`px-[22px]`, `gap-[7px]`) moves to the nearest Tailwind step.
4. **Text sizes keep their role names.** `text-meta`, `text-ui` and the rest stay. Tokens
   nothing reads are removed (`text-header`, `text-display`, `text-reply`, and `text-page`
   once the avatar debug view uses `text-sheet-title`); `text-nav-project` merges into
   `text-tool-title` (both serif 24/500). `text-subheading` and `text-body` stay apart: same
   size, but serif against sans and different line heights. Raw `text-[…px]` sizes take the
   nearest role.
5. **Small visual shifts are accepted** when they buy one shared component.
6. **Confirmations are popovers** (DESIGN.md §7): `LibraryParts.DeleteButton` becomes one
   shared confirmation used by `ItemMenu`, the Library, the Workflow step inspector and the
   Settings debug-data row. No `alert-dialog`.
7. **Hover hints use the shadcn `Tooltip`**, replacing the native `title` attribute (82 uses).
   An element that needs an accessible name keeps an `aria-label`.
8. **One card primitive.** `ui/card` gains an `outline` variant (white fill, 1px border), the
   "white card" of DESIGN.md. Interactive Components, paper sources and progress cards use it;
   neutral cards keep the default. Card padding comes from `Card`'s two sizes (`default`,
   `sm`), not from each call site.
9. **Tables use `ui/table`**, including the interactive table and Markdown tables, with the
   sticky header and sort buttons kept as classes on top.
10. **Shared custom components live in `components/shell/`**, one file per concern
    (`ErrorText.tsx`, `ListRow.tsx`, `Confirm.tsx`, `Hint.tsx`, …). `components/ui/` holds only
    what the shadcn CLI writes, plus `meta-parts.tsx`, so re-adding a shadcn component never
    collides with ours. `library/LibraryParts.tsx` keeps only Library-specific parts.
11. **Hover hints use a `Hint` shorthand** (`<Hint label="Close"><Button …/></Hint>`) built on
    the shadcn `Tooltip`; the full Tooltip parts stay for rich content such as the reaction
    tooltip.
12. **`SheetSection` gains a `description` slot** shown below the title, separate from the
    `meta` beside it; Settings sections use it for their sentences.
13. **Interactive Components share `interactive/ComponentCard.tsx`**, with `title`, `actions`
    and `footer` slots, built on `Card variant="outline"` with `CardHeader` and `CardFooter`.
14. **Navigation rows.** Under the wordmark, Home and Mini-Mes form the app's group; the
    Mini-Mes row leads with an avatar stack whose avatars hop in turn on hover. Below it, the
    Project's name heads the Project's group (Overview, Files) in the style of the other group
    headings, with a ⌄ for the Project menu; with no Project open, a dashed "No project open"
    card takes its place. Settings is a row under the status lines, led by the user's initials,
    or the Settings icon without a name.
15. **Search results open from their title.** `ResultCard` makes the title the link and leaves
    the card itself inert, since a dataset card holds other buttons.

## Risks / Trade-offs

- [Visual regressions across every view] → Each group ends with an in-app check of the views it
  touched, listed in its task.
- [Tests that query `title` break when hints move to `Tooltip`] → Those tests query the
  accessible name (`aria-label`) instead.
- [Removing radius overrides shifts `rounded-xl`/`2xl` everywhere at once] → Task A maps every
  existing use in the same step, so no class silently changes meaning.
- [A large single PR] → Commits follow the task groups, so the PR reads group by group.
