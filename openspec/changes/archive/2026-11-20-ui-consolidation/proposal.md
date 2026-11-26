# Proposal

## Why

The UI is built on shadcn/ui primitives, but the layer above them is written by hand in each
view: the same card, row, field, error line, empty state and header are repeated with slightly
different radius, padding and text size. Neighbouring elements visibly disagree (a 10px card
next to a 16px one, four hover colours for list rows), and every new view adds another copy.

## What Changes

- **Primitives:** the toggle and toggle-group match the other controls (focus, radius, disabled
  opacity); the tab switch has one style shared by tabs and the tool switch; every primitive
  uses the same focus and disabled treatment.
- **Radii:** the app uses Tailwind's stock radius scale. The overrides of `rounded-xs` to
  `rounded-2xl` and the custom `rounded-control`, `rounded-well`, `rounded-card`,
  `rounded-sheet` and `rounded-composer` tokens are removed; each role maps to the nearest
  stock class. Arbitrary spacing and size values snap to Tailwind steps.
- **Text sizes:** the named text sizes stay; unused ones are removed, true duplicates merged,
  and raw `text-[…px]` sizes replaced by a named size.
- **Unused tokens:** shadows, colours and radii that nothing reads are removed from
  `src/index.css`.
- **Shared parts:** one error line, one empty state, one status dot, one search field, one
  initials avatar, one popover confirmation, one form field (shadcn `field`), one component
  card, one result card, one list row, one tool-sheet group heading.
- **Existing components used where they fit:** `Button variant="link"` for link-style buttons,
  `ToggleGroup`, `Separator`, `Badge`, `ui/table` for every table, `SheetPage` and
  `SheetSection` for page and section headers, `DropdownMenu` for the Trait picker.
- **Tooltips:** hover hints use the shadcn `Tooltip` instead of the browser's `title`.
- **Navigation:** Home and Mini-Mes become plain rows under the wordmark, and the Project
  switcher moves down to head its own group with Overview and Files, the Mini-Mes' avatars hop on hover, and Settings is a row at the bottom, led by the
  user's initials. The open Project's name heads its group like the other group headings.
- **DESIGN.md** names the Tailwind class for each role instead of pixel values, and lists the
  shared components.

Small visual shifts in radius, spacing and hover follow from the above; they are intended.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. No requirement changes: every view behaves as before; only how it is drawn is unified.
The change sets `skip_specs: true`.

## Impact

- Code: `src/components/**` (about 45 files), `src/index.css`, `src/App.tsx`.
- New shadcn components added with the CLI: `field`, `empty`.
- Docs: `DESIGN.md`.
- No new dependency beyond shadcn component files, no external service, credential or cost.

## Out of scope

- Dark mode.
- New behaviour, new views, or changes to what any view shows.
- The Composer's `@` list (bound to the editor's keyboard handling), the chart's pointer
  tooltip, and Markdown's prose styles, which stay hand-styled on purpose.
- The Mini-Me and Trait colour system.
