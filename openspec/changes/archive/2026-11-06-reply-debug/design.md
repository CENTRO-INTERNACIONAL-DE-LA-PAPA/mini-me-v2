# Design

## Context

Debug records live in `debug_records` (`db.rs`, migration 11), one per message and kind, written
with `put_debug_record` and read with `get_debug_record`. Jev's record is the only kind.

A run starts with `run.start` (`link.rs`, `runs.rs`); its `context` is `RunContext`. In the
sidecar, `Run.trait()` and `Run.decide()` (`runs.py`) make a `CallContext` for each Trait call
and decision, knowing the Step and the Trait. Model calls go through `chat_model()`
(`providers.py`): streamed in `prompt.py`, and through `structured_answer()` in `choose.py`,
`dataverse.py` and `workflow/decide.py`, which may call the model twice. Tool calls run in
`prompt.py`'s `_converse` loop. The core finds a frame's reply through `Runs::active(run_id)`.

## Goals / Non-Goals

**Goals:**
- Catch every model call of a run in one place, so no call site needs its own recording.
- Store nothing, and send nothing over the link, while the switches are off.

**Non-Goals:**
- Recording model calls outside runs (summaries, document drafts, the model test).

## Decisions

These were settled with the user while planning:
- Every model call made for a reply is recorded; tool results are stored in full.
- Three switches, each storing one part; one "[DEBUG] AI" block per reply, a section per call.
- Records go in `debug_records`, read only when the block is opened; a call that continues the
  previous one stores only its new messages.
- Model calls are caught by a LangChain callback attached in `chat_model()`, not at each call
  site.
- Tokens are stored only where the provider already reports them; the model's stream is not
  changed to ask for usage.
- The link protocol version stays the same: `context.debug` defaults to off, and an older core
  ignores `run.debug`.

### Ordered records (Rust core)
Migration 11 → 12 rebuilds `debug_records` with `position INTEGER NOT NULL` in its key,
`(message_id, kind, position)`, copying Jev's records at position 0; SQLite cannot change a
table's key in place. `put_debug_record` keeps writing position 0 (Jev). `append_debug_record`
writes the next position for that message and kind. `debug_records(message_id, kind)` returns
the contents in order, and the IPC command becomes `get_debug_records`, which the Jev block
reads as a list of at most one.

### The switches (Rust core)
`Settings` gets `debug: { reply_input, reply_details, reply_tools }`, off by default, with an IPC
setter and the values in the AI settings view, next to Jev's. `RunContext` gets `debug: { input,
details, tools }`, each the switch AND Developer mode, filled where `run.start` is built.

### Catching model calls (sidecar)
A `Recorder` holds a run's `debug` flags, the Step and Trait names, the link, and the previous
call's input. `Run.trait()` and `Run.decide()` set it in a `ContextVar` while the call runs,
only when a flag is on; parallel branches each get their own, since each runs in its own task
and a `ContextVar` is per task. `chat_model()` adds the recorder's LangChain callback handler to
the model it builds when one is set: `on_chat_model_start` sees the input messages and starts a
timer, and `on_llm_end` gets the answer's `usage_metadata` and sends the `run.debug` entry. The
callback sees both of `structured_answer()`'s calls, and streamed calls once they end.

Tool calls are recorded in `_converse` after each tool's result is final (after the budget
check), through the same recorder, with the `id` of the model call that asked for them.

### Continuing calls
The recorder keeps the previous model call's input as serialised entries. When the new input
starts with all of them, the entry gets `continues` and only the rest. This keeps a Trait's
tool rounds from storing the whole Conversation once per round.

### Storing (Rust core)
`SidecarFrame::RunDebug { run_id, entry }` is handled like `run.progress`: `active(run_id)` finds
the reply, which `append_debug_record` stores under the run's Conversation. A frame for a closed
run is logged and dropped.

### The block (UI)
`ReplyDebugBlock` mirrors `JevDebugBlock`: shown under replies (not user messages) while
Developer mode and a reply switch are on, reading `get_debug_records(reply, "reply")` on each
open. A pure function groups the entries into model calls with their tool calls and rebuilds
each call's whole input from the calls it continues; it is unit-tested.

## Risks / Trade-offs

- [OpenRouter reports no token usage while streaming] → Its model calls show no tokens.
- [Large records] → Tool results and inputs are stored in full by the user's choice; "Debug
  data" clears them, and continuing calls avoid repeating the history.
- [A callback fault breaking a reply] → The handler catches its own errors and logs them, so a
  recording problem never fails the model call.

## Migration Plan

Migration 12 runs when a Project opens and keeps Jev's records. Older apps refuse the newer
database, as with every migration.

## Open Questions

None.
