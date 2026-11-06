# Proposal

## Why

The Project Overview's summary names files, tables and charts as plain text, such as
`field-trial-cleaned.csv`, so the user has to find them by hand. Messages already show `#` file
and `$` table and chart references as pills (#75).

## What Changes

- **The model marks the names** of files, tables and charts in the summary as `[name]()`, as the
  Conversations write them. The summary is stored as written.
- **The Overview shows each marked name as a pill**, the same `#` or `$` chip as in messages,
  when it is the name of a file of the Project or of a table or chart among the Overview's
  outputs: a file pill opens the file (a document in the editor), and a table or chart pill
  opens the reply that shows it. Any other marked name, such as one deleted since, shows as
  plain text.
- Summaries written before this change have no marks and show as before.
- Out of scope: `@` Mini-Me pills in the summary; editing the summary; changing what the summary
  is written from.

No new external service, credential or cost.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-overview`: the summary marks the names of files, tables and charts, and the Overview
  shows them as `#` and `$` chips that open them.

## Impact

- Sidecar: the summary's instructions say how to mark a name.
- UI: `OverviewView` turns the summary's marked names into `TextComponentChip`s, matching each
  name against the Project's files and the Overview's table and chart outputs; a `$` chip can
  now open what it names.
- No change to the core, the link protocol or the database.
