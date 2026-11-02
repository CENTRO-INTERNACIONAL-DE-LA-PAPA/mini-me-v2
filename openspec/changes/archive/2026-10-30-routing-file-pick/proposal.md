# Proposal

## Why

A message that means a file without tagging it ("@Validator check the cleaned data") makes
data Traits fail with "Reference a CSV, TSV or Excel (.xlsx) file…", even when the
Conversation has only one table it could mean, and prompt-based Traits have to guess from
the file names alone. Jev already answers several questions about every message, so it can
also say which of the Conversation's files the message is about, at no extra request (#4).

## What Changes

- When a message tags and attaches no file and its Conversation has files, routing asks Jev
  one more Choice question, `file`: one option per Asset of the Conversation, keyed by its
  ID and described by its name, plus `none`. It goes in the same Jev request as the others.
- At or above the confidence threshold, Jev's pick travels with the reply's run as
  `context.file`; it is not added to the user's message. A tagged or attached file always
  wins, since Jev is not asked then.
- A data Trait whose message points to no table reads, in this order: the file Jev picked,
  when it is a table; otherwise the newest table file of the Conversation; otherwise it fails
  as today. Its reply says which file it used and why.
- A prompt-based Trait sees the picked file marked in its list of the Conversation's files
  as the one the user probably means.
- The routing spec's "What is sent to Jev" requirement is brought up to date: it still says
  `{ message, files }` and forbids earlier messages, though Jev now also receives `recent`
  (the last few turns, sent since #2).

## Out of scope

- Interactive Components ("make that chart a bar chart", "the third row of that table"):
  Jev picking a component moves to a follow-up issue.
- Files of the Project that were never attached to or referenced in this Conversation;
  those still need a `#` tag.
- Join Data: it needs two tables, and both still need tags; it gets no fallback.
- Picking more than one file.
- Prompt-based Traits saying in their reply which file they used: the model decides that,
  as today.

No new external service, credential or cost: the `file` question rides in the existing
Typesafe request.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `routing`: Jev is asked the `file` question; `route.start` carries the Conversation's
  files as its options; the pick is passed to the run as `context.file`; what is sent to Jev
  now includes the recent turns and the Conversation's file names.
- `data-traits`: Tables a data Trait reads falls back to the picked file, then the
  Conversation's newest table, and the reply names the file it used.
- `tool-use`: Prompt Traits know the Conversation's results marks the picked file.

## Impact

- Rust core: `src-tauri/src/routing.rs` (the `file` question, its options, the decision),
  `src-tauri/src/runs.rs` (`RunSpec` carries the pick), `src-tauri/src/link.rs`
  (`RouteStart` gains `files`, `RunContext` gains `file`).
- Sidecar: `sidecar/src/mini_me_sidecar/routing.py` (the `file` Choice),
  `context.py` (`CallContext.file`), `adapters/data/replies.py` (`read_tables` fallback),
  `adapters/prompt.py` (marking the picked file).
- Protocol: `route.start` and `run.start` each gain one field; both sides ship together, so
  no compatibility handling is needed.
