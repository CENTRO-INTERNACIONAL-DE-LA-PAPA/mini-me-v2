# Design

## Context

Adapters already have what the data Traits need. `ctx.read_asset` reads a referenced Asset
in 1 MiB chunks through the core. `ctx.write_asset` saves a generated file (up to 32 MiB)
and attaches it to the reply. `ctx.component` adds an Interactive Component (up to 2 MiB of
data) of a kind the Trait lists. The `prompt` adapter holds the LangChain code that builds a
chat model for each provider and turns provider errors into `TraitError`s. The core sends a
call's model only to adapters that declare providers. The UI draws component kinds from
`src/components/interactive/catalogue.ts`.

## Goals / Non-Goals

**Goals:**
- Data results computed only by pandas and pointblank, never by the model.
- The model sees a description of the data, never rows, and the reply says what it saw.
- One shared path for reading tables, describing them and building previews, so #11's
  Traits reuse it.

**Non-Goals:**
- Streaming very large files: a table is read into memory (100 MiB cap).
- Remembering cleaned versions as a chain; each cleaned file is a new, unrelated Asset.

## Decisions

### Four adapters in one package, one Trait each
`adapters/data/` holds `profile.py`, `validate.py`, `clean.py` and `join.py` (adapters
`data-profile`, `data-validate`, `data-clean`, `data-join`), with shared modules:
- `tables.py`: reads an Asset into a pandas DataFrame by extension and picks the Excel
  sheet. For CSV and TSV it detects the encoding (UTF-8, UTF-8 with BOM, then Latin-1) and,
  for `.csv`, the delimiter (`,` or `;`, since semicolon CSVs are common in Spanish locales).
  Column types map to `number`, `text`, `date` (a text column where at least 90% of non-empty
  values parse as dates) and `boolean`.
- `describe.py`: builds the model's description of a table and the "shared" line.
- `preview.py`: turns a DataFrame into `table` component data.

One adapter per Trait keeps each run contract small and lets *Profile Data* declare no
providers, so the core never sends it a model or key. The alternative, a single `data`
adapter that switches on the Trait's name, would tie behaviour to a name users can change
once Traits are editable.

### Provider code shared with the `prompt` adapter
`_chat_model`, `_provider_error` and `PROVIDER_NAMES` move from `prompt.py` to
`adapters/providers.py`, unchanged, and both adapters import them. Duplicating them was the
alternative; one copy keeps the provider list and error messages consistent.

### The model answers with a fixed schema
*Validate Data*, *Clean Data* and *Join Data* call `with_structured_output` with a Pydantic
model: a list of entries, each a discriminated union of the catalogue's checks or actions
with typed parameters. LangChain supports this for OpenAI, Anthropic, Google and OpenRouter
(through the OpenAI client). The adapter then validates each entry against the table (do
the columns exist, are the parameters valid?) and drops invalid ones, listing them in the
reply. The Trait's `instructions` hold the guidance (for example "choose only checks the
user asked for"); the adapter adds the catalogue, the description of the tables and the
message. Free-text answers parsed with regular expressions were the alternative, but
they're brittle and can't be validated before running.

**Catalogues:**
- Checks: `not_null(columns)`, `unique(columns)`, `in_range(column, min, max)`,
  `in_set(column, values)`, `matches(column, pattern)`, `has_type(column, type)`. The first
  five map to pointblank's `col_vals_not_null`, `rows_distinct(columns_subset)`,
  `col_vals_between` (or `_ge`/`_le` with one bound), `col_vals_in_set` and
  `col_vals_regex`. A range check reads its column as numbers, so text values fail it.
  `has_type` is counted per value with pandas, since pointblank only checks a column's
  declared type.
- Defaults: `rows_distinct()`, and a not-all-null check per column, computed with pandas and
  reported in the same table.
- Cleaning actions (from v1's `clean_from_findings.py`): `strip_whitespace`,
  `normalize_missing(values)`, `change_case(column, case)`, `cast(column, type)`,
  `map_values(column, mapping)`, `replace_regex(column, pattern, replacement)`,
  `drop_duplicates(columns?)`, `drop_rows_where(column, operator, value)`,
  `clip(column, min, max)`, `fill_missing(column, value)`, `rename_columns(mapping)`,
  `sort(columns, descending)`.
- Join: `{ left_on, right_on, how }`.

### What the model is told
`describe.py` sends, per table: file name, row count, and per column: name, type, missing
count, distinct count, min and max for numbers and dates. Columns with 30 or fewer distinct
values list their top 20 values with counts, unless the column name matches the personal
pattern (`name`, `nombre`, `phone`, `tel`, `email`, `correo`, `address`, `direcci`, `dni`,
`document`, `lat`, `lon`, `gps`, `coord`, matched as whole words or name parts). *Join
Data* sends only names and types, and its reply has no shared line. The shared line reads, for example: "Shared with the AI
model: column names, types and statistics; values of `variety`, `site`."

### Imports load on demand
pandas and pointblank take about a second to import, and most calls never use them, so
the data adapters import them inside `run`, with a comment saying why, as CLAUDE.md allows.
The sidecar's start time is unchanged.

### Results and files
- *Profile Data*: a text summary, plus a `table` with columns Column, Type, Missing,
  Missing %, Distinct, Min, Max.
- *Validate Data*: a `table` with Check, Column, Passed, Failed, Result, plus
  `<stem>-validation.html` from pointblank's tabular report (`text/html`, opened in the
  browser like any Asset).
- *Clean Data*: a `table` with Action, Column, Changed, then a preview of the cleaned data.
  Output keeps the input's format (CSV, TSV, or `.xlsx` with one sheet) as
  `<stem>-cleaned.<ext>`. Asset names may repeat, since Assets are addressed by ID, so a
  second cleaning of the same file is a new `field-trial-cleaned.csv` Asset. An action that
  would drop more than half the remaining rows is skipped and reported.
- *Join Data*: counts and unmatched keys in text, then a preview; output
  `<stem>-joined.csv`. pandas `merge(..., indicator=True)` gives the unmatched counts.
- A file over 32 MiB can't be written (the `asset.write` cap). The reply then gives the
  preview and says the full result is too large to save.

### Table previews
`preview.py` keeps at most 500 rows, and fewer if the JSON would pass 1.5 MiB, leaving room
under the 2 MiB component cap. It sets `total_rows`, and `source` to the saved Asset's name.
Values become JSON numbers, strings, booleans or `null`. Dates become ISO strings, and NaN
or NaT become `null`.

### Table component in the UI
`src/components/interactive/table.tsx` uses `@tanstack/react-table` (headless, about 15 KB
gzipped), as `openspec/config.yaml` prescribes for tables. Sorting uses TanStack's sorting
model with nulls last. Styling follows DESIGN.md: a white bordered container with radius
10, a `#F5F5F4` header row at 12.5px muted, 13.5px rows with `tabular-nums` and hairlines,
numbers right-aligned, a scroll area of at most 420px with a sticky header, and a footer
line for previews.

### Instructions
*Profile Data* has none. The others guide the model's choice; the adapter adds the
catalogue, the table descriptions and the message.
- **Validate Data:** "You choose data quality checks for a researcher. From the user's
  message and the description of their table, choose the checks from the catalogue that
  express the rules the user asks for, with their parameters. Choose only checks the user
  asked for or that their words clearly imply; the default checks always run, so don't
  repeat them. Use only columns that the description lists. If the message asks for no
  rule, choose none."
- **Clean Data:** "You choose cleaning actions for a researcher. From the user's message
  and the description of their table, choose the actions from the catalogue that do what
  the user asks for, in the order they should run, with their parameters. Choose only
  actions the user asked for or that their words clearly imply, and use only columns and
  values that the description lists. Prefer keeping data over removing it; never drop rows
  unless the user asks for it."
- **Join Data:** "You choose how to join two tables for a researcher. From the user's
  message and the column names of both tables, choose the key columns of each table and the
  join type (inner, left, right or outer; left unless the user asks otherwise). Use only
  columns that the tables have."

### IDs and colours

| Trait | ID suffix | Adapter | Colour | Mini-Me | ID suffix |
|---|---|---|---|---|---|
| Profile Data | `7a18` | data-profile | `oklch(0.8 0.09 200)` | Profiler | `7b11` |
| Validate Data | `7a19` | data-validate | `oklch(0.78 0.13 355)` | Validator | `7b12` |
| Clean Data | `7a20` | data-clean | `oklch(0.76 0.15 55)` | Curator | `7b13` |
| Join Data | `7a21` | data-join | `oklch(0.8 0.08 240)` | Linker | `7b14` |

| Mini-Me | Family | Tint | Solid | Ink |
|---|---|---|---|---|
| Profiler | cyan 215 | `#CEF3FC` | `#0096AF` | `#006277` |
| Validator | red 20 | `#FFE1E0` | `#DD4D57` | `#9B1B2D` |
| Curator | magenta 320 | `#F8E3FC` | `#B25EC5` | `#793089` |
| Linker | slate 245 | `#E1EDF8` | `#688AA8` | `#3B5972` |

Every ink has at least 5.9:1 contrast on its tint.

### Dependencies
`pandas`, `pointblank` and `openpyxl` are added to `sidecar/pyproject.toml` and locked with
`uv lock`. They resolve for Python 3.14 on Windows, macOS and Linux with binary wheels and
no system prerequisites (checked with `uv pip compile` for each platform): pandas 3.0,
pointblank 1.1, openpyxl 3.1, numpy 2.5 and about 30 small pure-Python packages, such as
great-tables and narwhals. `bundle.py` installs from the lock, so the bundle picks them up.

## Risks / Trade-offs

- [Bundle size grows by about 70 MB, mostly numpy and pandas] → Acceptable for a desktop
  app. The installer stays one download, and updates already replace the bundle.
- [The model picks wrong checks or actions] → It only picks from the catalogue, every entry
  is validated against the table, the reply lists what was applied and what was ignored, and
  cleaning never overwrites the input.
- [Category values may still be sensitive] → Only low-cardinality columns are listed,
  personal-looking names are never sampled, and the reply names every column whose values
  were shared.
- [Memory use on large files] → The 100 MiB cap; the reply fails clearly above it.
- [pointblank's API changes] → The version is pinned in `uv.lock`, and its use is limited
  to `validate.py`. *Profile Data* is computed with pandas alone.
