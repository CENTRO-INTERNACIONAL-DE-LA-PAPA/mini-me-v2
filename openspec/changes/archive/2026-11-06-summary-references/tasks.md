# Tasks

## 1. Marked names and pills

- [x] 1.1 Ask the model in `SUMMARY_RULE` to mark file, table and chart names as `[name]()`, and show marked names on the Overview as the `#` and `$` chips of messages (`TextComponentChip`, which gains `onOpenComponent` and `componentKind`), matched against the Project's files and the Overview's table and chart outputs, opening a file, a document, or a component's reply, and showing any other name as plain text; verify with frontend tests of `summaryParts` and `findNamed`, `npm test`, `uv run pytest`, and in the app that "Update summary" shows pills that open a file and a chart's reply

## Workflow follow-up

- Archive the change with `/opsx:archive`, then open the pull request into `dev`.
