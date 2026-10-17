# Proposal

## Why

Mini-Me aims to cover the full Data Lifecycle, one Trait per step, so that Workflows can
later join the steps a study needs. The first steps after getting a dataset are inspecting
and preparing it: knowing what is in it, checking it against rules, cleaning it and joining
it with other tables. Researchers at CIP do this on CSV and Excel field data every day.
Mini-Me v1 did it by letting the model write and run code on the host, which v2 rules out
until there is a sandbox. These four steps can instead be fixed tools in the sidecar, with
the model at most choosing what to apply.

## What Changes

- **Four new data Traits**, run by new adapters as fixed tools (pandas and pointblank in the
  sidecar). The model never writes or runs code, and never computes a result.
  - *Profile Data* reports each column's type, missing values, distinct values and range,
    plus the table's shape and duplicate rows. It uses no model.
  - *Validate Data* runs default checks (no fully empty columns, no duplicate rows) plus
    checks the model chooses from a fixed catalogue: not-null, unique key, range, allowed
    values, pattern and type. Results come only from pointblank.
  - *Clean Data* applies cleaning actions the model chooses from a fixed list (for example
    trim whitespace, normalise missing-value codes, map category values, drop duplicates,
    cast types). pandas applies them to the full data, and the result is saved as a new
    Asset. The original is never changed.
  - *Join Data* joins two tables on key columns and reports keys without a match. The model
    chooses the keys and join type from the message and the column names.
- **What the model sees of the data:** column names, types, summary statistics and the most
  frequent values of low-cardinality columns. It never sees rows. Columns that look like IDs,
  free text or personal data are never sampled. Each reply says what was shared.
- **Files:** CSV, TSV and Excel (`.xlsx`), referenced with `#` or attached.
- **A `table` Interactive Component:** a sortable, scrollable table drawn with TanStack
  Table. Large tables show a preview, and the full result is attached as an Asset.
- **Four new predefined Mini-Mes**, one per Trait, each with a one-Step Workflow: **Profiler**
  (*Profile Data*), **Validator** (*Validate Data*), **Curator** (*Clean Data*) and
  **Linker** (*Join Data*).

## Out of scope

- Selecting and referencing table cells, rows or columns (`#selection`). That becomes its
  own change, added to the Roadmap when this one is finished.
- The explore and explain data Traits (change #11), charts, and code execution.
- Formats other than CSV, TSV and `.xlsx` (no `.xls`, Parquet or JSON).
- Editing a table in the UI.

**Data leaving the machine:** *Validate Data*, *Clean Data* and *Join Data* send a
description of the data to the AI provider chosen in Settings (names, types, statistics, top
category values; never rows). *Profile Data* sends nothing. No new external service,
credential or cost.

## Capabilities

### New Capabilities

- `data-traits`: the data Traits: which files they read, what the model may see, and what
  each Trait computes, replies and saves.

### Modified Capabilities

- `mini-mes`: the library gains *Profile Data*, *Validate Data*, *Clean Data* and *Join
  Data*, and Mini-Me ships with thirteen predefined Mini-Mes.
- `interactive-components`: a new `table` kind, listed by the four data Traits.

## Impact

- Sidecar: four new adapters, a shared module for reading tables and describing them to the
  model, and the provider code moved out of the `prompt` adapter so the new adapters can
  call a model. New dependencies: pandas, pointblank and openpyxl (with numpy and about 30
  smaller packages), which makes the bundled sidecar noticeably bigger.
- UI: the `table` renderer and the `@tanstack/react-table` dependency.
- `src-tauri/library/builtin.json` and the `library.rs` tests.
- No change to the event or link protocol, storage or Rust logic.
