# Tasks

Every task: `npx tsc --noEmit` is clean and `npm test` passes, in addition to the check it
names. Shadcn components are added by the user with the CLI command given in the task.

## 1. Primitives and tokens

- [x] 1.1 Restyle `ui/toggle.tsx` and `ui/toggle-group.tsx` to the other controls: outline
  focus (`outline-2 outline-ring`), `disabled:opacity-40`, no `dark:` rules; remove the unused
  `default`/`outline`/`sm`/`lg` variants and the `data-[spacing=0]` rules. Verify: keyboard
  focus on the tool switch shows the same outline as a button.
- [x] 1.2 Give tabs and the tool switch one tab-switch style: one class set used by
  `TabsList`/`TabsTrigger` and the `switch` toggle variant. Verify: a Settings section list
  and the Document view's tool switch look and behave alike (hover, selected, focus).
- [x] 1.3 Make the other primitives agree: `disabled:opacity-40` on select items, dropdown
  items and `Label`; `Badge` uses `text-control`. Verify: grep finds no `opacity-50` under
  `components/ui/`.
- [x] 1.4 Remove the radius overrides (`--radius-xs` to `--radius-2xl`) and the role radii
  (`control`, `well`, `card`, `sheet`, `composer`) from `src/index.css`, and map every use to
  the table in design.md, including `rounded-[5px]` and `rounded-[10px]`. Verify: grep finds no
  `rounded-(control|well|card|sheet|composer)` and no `rounded-[…]` except the bubble corner.
- [x] 1.5 Prune text sizes: remove `text-header`, `text-display` and `text-reply`; move the
  avatar debug view to `text-sheet-title` and remove `text-page`; merge `text-nav-project` into
  `text-tool-title`; replace `text-[11.5px]`, `text-[10px]`, `text-[13px]` and `text-[15px]` with
  a named size (the Files initials' `text-[7px]` goes with 2.5). Verify: grep finds no other
  `text-[…px]` under `src/components`.
- [x] 1.6 Remove tokens nothing reads: the six `--shadow-*`, `--surface-1`,
  `--border-composer`, and each `--chart-N` not read directly or through a built name. Verify:
  grep for each removed name, including `chart-${`, finds nothing.
- [x] 1.7 Snap arbitrary spacing (`px-[22px]`, `gap-[7px]`, `gap-[18px]`, `pt-[22px]`, …) to
  the nearest Tailwind step; keep fixed layout widths (sheet and column widths). Verify: grep
  for `-\[[0-9.]+px\]` lists only layout widths.
- [x] 1.8 Update DESIGN.md §4 and §5 to name Tailwind classes instead of pixel values, with
  the radius table from design.md and the pruned text sizes. Verify: DESIGN.md names no token
  removed in 1.4–1.6.
- [x] 1.9 In the app: walk Home, a Conversation, a Document, the Library, a Mini-Me and a Trait
  editor, a Workflow, Files, the Overview and Settings; radii and spacing look intended, and
  nothing is clipped or misaligned.
- [x] 1.10 Lay out the navigation as in design.md decision 14 (Home and Mini-Mes rows with the
  hopping avatar stack, the Project's name as its group heading, Settings at the bottom). Verify:
  in the app, the rows highlight with their views and the Project menu opens from the name.
- [x] 1.11 Limit `scrollbar-gutter: stable` to scrolling elements, so clipped pills keep even
  padding. Verify: Mini-Me name tags and chips have no empty gutter on the right.

## 2. Small shared parts

- [x] 2.1 Add `shell/ErrorText.tsx` and use it for every hand-written
  `text-meta text-destructive` error line, spacing coming from the parent's gap. Verify: grep
  finds `text-destructive` error paragraphs only in `ErrorText`, `StatusRow` and field errors.
- [x] 2.2 User runs `npx shadcn@latest add empty`; restyle it to DESIGN.md and use it for every
  empty state (Library, Trait and Mini-Me editors, Home, Overview, Settings, Files, Outline,
  Comments, Report, dataset results, Conversation), at one text size. Verify: grep finds no
  other empty-state text classes in those files.
- [x] 2.3 Add `shell/StatusDot.tsx` and use it in `StatusRow` and Settings' account status.
  Verify: the sidecar status line and the Settings accounts show the same dot.
- [x] 2.4 Add `shell/SearchInput.tsx` and use it in the Library and Files. Verify: both search
  fields have the same width, icon and behaviour.
- [x] 2.5 User runs `npx shadcn@latest add avatar`; restyle it and use its fallback for your
  initials in the navigation's Settings row and in Files. Settings' API-key tiles are provider
  marks, not people, and stay as they are. Verify: both show initials in the same style.
- [x] 2.6 Replace link-style raw `<button>`s with `Button variant="link"` (Files, Report panel,
  interactive table, theories, dataset results, Overview, editor header), with one hover
  style (underline); the attachment tray's remove button becomes a ghost icon `Button`. Verify:
  the raw `<button`s left are the rows, cards, sort headers and menus that 2.7, 4.2–4.5 and 5.5
  replace, plus the wordmark and the Project heading.
- [x] 2.7 Swap hand-drawn controls for existing components: chart-type switch and avatar
  colour swatches → `ToggleGroup`; Document view divider → `Separator`; reaction pill → `Badge`;
  `MiniMeCard`'s origin label → `OriginBadge`. The comment number stays its own square mark,
  matching the one beside its passage. Verify: each still works by keyboard.
- [x] 2.8 User runs `npx shadcn@latest add slider`; restyle it and use it for the hue control
  in the avatar colour picker, keeping its gradient track. Verify: dragging and arrow keys
  change the hue.
- [x] 2.9 Add the new parts to DESIGN.md §7. Verify: each part added in 2.1–2.8 is named there.
- [x] 2.10 In the app: trigger an error (wrong API key), see empty states (new Project), search
  the Library and Files, switch a chart's type, pick an avatar colour.

## 3. Fields and confirmations

- [x] 3.1 User runs `npx shadcn@latest add field`; restyle it to DESIGN.md. Verify: `tsc` clean.
- [x] 3.2 Build Settings' `SettingRow` on `Field` (horizontal), its errors and statuses on
  `FieldError`/`FieldDescription`. Verify: every Settings row keeps its label, hint and error.
- [x] 3.3 Replace `LibraryParts.Field` and the Workflow step inspector's `Row` with
  `shell/LabelledField.tsx` (on `Field`, vertical), and its "Ask before running" block with a
  horizontal `Field`. Verify: the Trait editor, Mini-Me editor
  and step inspector show labels and hints in one layout.
- [x] 3.4 Turn `LibraryParts.DeleteButton` into `shell/Confirm.tsx` (question, ghost Keep holding
  the focus, destructive action, popover aligned right) and use it in `ItemMenu`, the Library,
  the step inspector and Settings' debug-data row. Verify: deleting a Conversation, a Trait and
  a Step, and clearing debug data, each asks the same way and Keep cancels.
- [x] 3.5 Update DESIGN.md §7 (Inputs, Popovers) for `Field` and the confirmation. Verify:
  both are named there.

## 4. Cards, rows and tables

- [x] 4.1 Add an `outline` variant to `ui/card` (white fill, 1px border) and make call sites
  use `Card`'s `default`/`sm` sizes instead of their own padding (Settings accounts, Library
  problems, editor problems, Overview, Home project cards, Mini-Me editor, Quarto notice,
  Document view cards, the Home and Trait editor Mini-Me rows). Verify: grep finds no
  `rounded-… border … bg-card` shells outside `ui/card`.
- [x] 4.2 Add `interactive/ComponentCard.tsx` (title, actions, footer) on
  `Card variant="outline"` and use it for every Interactive Component and the Workflow progress
  card. Verify: a reply with a table and a chart shows matching corners, header and footer.
- [x] 4.3 Add `interactive/ResultCard.tsx` and use it for paper sources and dataset results,
  opening the result as settled in design.md's open question. Verify: both kinds of result look
  and open alike.
- [x] 4.4 Turn `LibraryParts.Row` into `shell/ListRow.tsx` (leading sign, name over meta, right
  slot, `hover:bg-muted`) and use it in the Library, Overview outputs, Settings' key, Ai2 and
  feature-flag rows, the Outline and Steps panels, Comments and the Report panel. Verify: those
  rows share one radius and hover.
- [x] 4.5 Build the interactive table and Markdown tables on `ui/table`, keeping the sticky
  header and sort buttons. Verify: `npm test` passes, sorting works, and both tables share
  header weight and row padding.
- [x] 4.6 Update DESIGN.md §7 (Cards, Rows and lists) for the outline card, `ComponentCard`,
  `ResultCard` and `ListRow`. Verify: each is named there.
- [x] 4.7 In the app: a reply with a table, a chart, paper sources and datasets; the Library;
  the Overview; Settings; Outline, Steps and Comments.

## 5. Page shells and headers

- [x] 5.1 Add a `description` slot to `SheetSection`; build Settings' `PageHeader` and `Section`
  and the Library's origins header on `SheetHeader`/`SheetSection`. Verify: Settings and the
  Library show headings in one style.
- [x] 5.2 Build the License, What's New and Third-party views on `SheetPage`. Verify: they sit
  at the same inset as other pages and still close.
- [x] 5.3 Add `ToolSheetGroup` to `shell/Sheet.tsx` and use it in the Outline and Steps panels,
  Comments and the Report panel; delete `SidePanel`. Verify: group headings match in all four.
- [x] 5.4 Put the editor body padding on `EditorPage` and remove it from the Trait and Mini-Me
  editors. Verify: both editors' content lines up with their headers.
- [x] 5.5 Replace the Workflow canvas's hand-built Trait picker with a `DropdownMenu` opened at
  the drop point. Verify: dropping onto the canvas opens it there; arrows, Enter and Escape work.
- [x] 5.6 Update DESIGN.md §7 (Sheets and headers) for the description slot and
  `ToolSheetGroup`. Verify: both are named there.
- [x] 5.7 In the app: Settings, the Library, the About pages, the tool sheets, both editors, and
  adding a Step by dropping a Trait.

## 6. Tooltips

- [ ] 6.1 Add `shell/Hint.tsx` on the shadcn `Tooltip`, and a `TooltipProvider` at the app root
  if Base UI needs one for a shared delay. Verify: one hint shows on hover and keyboard focus.
- [ ] 6.2 Replace `title=` with `Hint` in `shell/`, `workflow/` and `App.tsx`; an element with no
  visible text keeps an `aria-label`. Verify: grep finds no `title=` in those files.
- [ ] 6.3 Same for `chat/`, `documents/` and `interactive/`. Verify: grep as above.
- [ ] 6.4 Same for `settings/`, `library/`, `home/`, `overview/`, `files/` and `avatar/`.
  Verify: grep finds no `title=` attribute under `src/components` outside `ui/`; tests that
  queried `title` query the accessible name and `npm test` passes.
- [ ] 6.5 Update DESIGN.md §7 (Popovers, tooltips, menus) for `Hint`. Verify: named there.
- [ ] 6.6 In the app: hover and tab through the navigation, the sheets' icon buttons, the
  Composer and a reply's actions; every hint appears in the same style.

## Workflow follow-up

- Add to `CHANGELOG.md` under "Improved": the app looks more consistent, with matching cards,
  rows, fields and hints throughout.
- Archive the change (`/opsx:archive`); it has no delta specs.
- Open the pull request from `refactor/ui-consolidation` into `dev`.
