# Proposal

## Why

When a reply goes wrong there is no way to see what the AI model was given: the system prompt,
the earlier messages, the table descriptions or the tool results. Nor which model answered, how
long it took and how many tokens it used, or which tools it called with which arguments. The
debug records added for Jev (#146) give these a place to be kept without slowing Conversations.

## What Changes

- **Every model call made for a reply is recorded** while Developer mode and a reply debug
  switch are on: the calls of prompt-based Traits (each tool round is its own call), data
  Traits choosing what to run, the Dataverse search, and Workflow decisions. They are caught in
  one place in the sidecar, so a new call site is recorded without extra work.
- **Three switches** on the Developer page, each storing one part:
  - "Show what the AI read": each call's input messages. A call that continues the previous
    call of the same Trait stores only its new messages.
  - "Show model call details": provider, model, time taken, and tokens in and out when the
    provider reports them.
  - "Show tool calls": each tool a model called, with its arguments and its full result.
- **A "[DEBUG] AI" block** under each reply, with one section per model call (its Step and
  Trait, its details, what it read, then the tools it called), read when expanded, and "Copy as
  JSON".
- **Debug records gain an order**: a message can hold several records of one kind, kept in the
  order they were written.
- **Protocol**: `run.start`'s `context` says which parts to collect, and the sidecar sends each
  entry in a new `run.debug` frame.
- Out of scope: model calls outside replies (Conversation summaries, document drafts, the model
  test in Settings); cost estimates; replaying a call.

No new external service, credential or cost. OpenAI-compatible providers are asked to report
token usage while streaming.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `debug-records`: records of a kind are ordered; the `reply` kind; the "[DEBUG] AI" block.
- `dev-channel`: the three switches on the Developer page, which need Developer mode.
- `trait-execution`: `run.start`'s `context.debug` and the `run.debug` frame.

## Impact

- Rust core: `db.rs` (migration 12: `position` in `debug_records`' key), `store.rs` (appending
  and reading ordered records), `settings.rs` and `ipc.rs` (the switches, reading records),
  `link.rs` and `runs.rs` (`RunContext.debug`, the `run.debug` frame), the frames fixture.
- Sidecar: a recorder in `context.py` or its own module, set for each Trait call and decision
  in `runs.py`; `providers.py` (attaching it to every chat model); `prompt.py` (tool calls).
- UI: a `ReplyDebugBlock` under replies, `JevDebugBlock` reading ordered records, `api.ts`,
  `types.ts`, `SettingsView.tsx`; `docs/architecture.md`.
