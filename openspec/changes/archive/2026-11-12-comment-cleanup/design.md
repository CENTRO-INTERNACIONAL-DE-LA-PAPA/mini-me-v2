# Design

## Context

See proposal.md for why. The standard is the Comments section of `CLAUDE.md`. The scan of
2026-11-11 lists the worst examples per file, with proposed rewrites, in the "Comments" parts of
its reports; those are starting points, and every comment in a file is read, not only the listed
ones.

Some text that looks like a comment is read by the AI model: the class docstrings of pydantic
models passed to a model as a schema (the plan entries in `adapters/data/catalogue.py`,
`ModelTest` in `summary.py`, `DataverseSearch` in `adapters/dataverse.py`) and the tool
descriptions in `tools/model.py`. Changing them changes what the model is asked.

## Goals / Non-Goals

**Goals:**
- A reader opening any file sees comments that are short, true and say only what the code cannot.
- No behaviour changes: every test suite passes unchanged after each task.

**Non-Goals:**
- Renaming or restructuring code so a comment becomes unnecessary (#26).
- Adding comments: the change only shortens, corrects or deletes existing ones.

## Decisions

1. **One pass per area, reading every comment.** Each task covers one part of the code (the Rust
   core in two halves, the UI in two halves, the sidecar) and rewrites or deletes comments by the
   rules: keep why, contracts, invariants and warnings; drop restated names, history, caller lists
   and hedging; one line unless a warning needs more.
2. **Model-facing text is left as it is.** Docstrings and descriptions the model reads (see
   Context) are prompts, not comments, and are not edited.
3. **Wrong comments are fixed, not just shortened** (confirmed by the user). Where a comment
   does not match the code, it is rewritten to match the code; the code is never changed to
   match the comment.
4. **Comments that need a code change to fix are listed for #26, not changed now** (confirmed by
   the user), for example a comment that would go away with a better name.
5. **Each task's diff is reviewed uncommitted.** The user reviews each task's changes before its
   commit.

## Risks / Trade-offs

- [A shortened comment drops a constraint someone relied on] → Only restatements, history and
  repetition are dropped; a warning or invariant keeps its substance even when it needs two lines.
- [Large diffs are tedious to review] → One task per area keeps each diff to one part of the code,
  and the report summarises the kinds of change rather than listing every line.
