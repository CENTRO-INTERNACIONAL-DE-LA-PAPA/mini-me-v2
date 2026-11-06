# Design

## Context

The summary is written by the sidecar (`summary.py`, `SUMMARY_RULE`) from
`overview::summary_material`, which holds only message text, without IDs. The core stores it in
the `overview` table, and `OverviewView` shows it as a plain paragraph. Sent messages show `#`
and `$` references with `TextComponentChip`.

## Goals / Non-Goals

**Goals:**
- Names in the summary shown as the same pills as in messages, by changing only how the summary
  is written and shown.

**Non-Goals:**
- `@` Mini-Me pills, editing the summary, changes to the material, the core or the database.

## Decisions

These were settled with the user while planning:
- Scope as in #75: files, tables and charts; a file pill opens the file, a table or chart pill
  opens the reply that shows it.
- The model marks names, not IDs, as `[name]()`; the Overview matches the names when it shows
  the summary. The material stays as it is.
- A marked name that matches nothing, whether made up or deleted since, shows as plain text.
- The pills are the same `#` and `$` chips as in messages (`TextComponentChip`). A `$` chip shows
  the name as the model wrote it.

### Marking (sidecar)
`SUMMARY_RULE` asks the model to put each file, table or chart it names in square brackets
followed by `()`, with the name exactly as the Conversations write it.

### Showing (UI)
`summaryParts()` splits the summary into text and marked names. `findNamed()` matches a name,
ignoring case, a leading `#` or `$`, and spaces or other characters that `$` names write as
`-`: first against the Project's files (read with the Overview), then against the newest
`table` or `chart` output with that title. A file shows as a `#` chip that opens it as Files does;
a table or chart as a `$` chip that calls `onOpenConversation` with its reply, for which
`TextComponentChip` gains `onOpenComponent`, and `componentKind` for a chart's icon outside a
Conversation.

## Risks / Trade-offs

- [Two tables or charts with one title] → The pill opens the newest.
- [The model does not mark a name, or changes it] → It shows as plain text.

## Migration Plan

None: summaries are stored as before, and those written earlier have no marks.

## Open Questions

None.
