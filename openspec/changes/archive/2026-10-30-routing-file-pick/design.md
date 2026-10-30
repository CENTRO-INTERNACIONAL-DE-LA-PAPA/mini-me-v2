# Design

## Context

See proposal.md for why. The relevant pieces today:

- `routing.rs` `route()` builds Jev's state with `state(message, recent)`, asks
  `mini_me` / `reaction` / `needs_context` through `Runs::route` (`route.start`), and
  `decide()` turns the answers into a `Decision { answerer, reaction, needs_context }`.
  `start_reply()` builds a `RunSpec` and starts the run.
- `RunSpec.needs_context` already travels to the sidecar as `run.start`'s
  `plan.context.needs_context`. The sidecar's `runs.py` merges the run's `context` into
  every Trait call's context, so a new context field reaches every Step of a Workflow
  without other changes.
- `history::results()` lists a Conversation's Assets (attached or referenced by its
  messages), newest first, at most 50. It is what `conversation.results` returns and what
  prompt-based Traits see as "Files in this Conversation".
- In the sidecar, `read_tables()` (`adapters/data/replies.py`) reads `table_sources()` of
  the message and raises `no_table` when there are none. Every data Trait calls it; Join
  Data needs two tables.

## Goals / Non-Goals

**Goals:**
- One source for "the Conversation's files", shared by Jev's options, the sidecar's
  fallback and the prompt Traits' list, so they never disagree.
- No new request: `file` rides in the existing Jev request.

**Non-Goals:**
- Changing how a tagged or attached file is read.
- Storing the pick: it lives only in the run, like `needs_context`.

## Decisions

**The Rust core lists the options with `history::results()`.** `route()` already loads the
Conversation's messages for `recent`; it calls `results()` with them (with the user's
message as both `answers` and `reply`, as a reply does not exist yet) and takes its
`assets`. Using the same function as `conversation.results` keeps Jev's options equal to
what Traits see. *Alternative:* a separate query over the `assets` table, rejected because
it would list Project files the Conversation never used, which the issue rules out.

**Options travel in `route.start.files`, not in `state`.** The sidecar needs IDs to build
the Choice's criteria, as it does for `mini_mes`; putting them in `state` would make Jev
read IDs as part of the message. Jev sees each file's name through the Choice's criteria.

**`file` is asked only when the message references and attaches no Asset, and the
Conversation has at least one.** A tagged file always wins, so asking would be wasted, and
an empty option list is not a useful Choice.

**The pick uses the routing threshold.** `decide()` accepts the `file` answer under the same
rule as `mini_me`: at or above the threshold, not `none`, and one of the offered IDs.
`Decision` gains `file: Option<AssetRef>`, looked up from the offered options, so the run
gets the name without another query.

**The pick reaches Traits as `context.file`.** `RunSpec` gains `file: Option<AssetRef>`
next to `needs_context`, and `RunContext` gains `file: Option<RunFile { asset_id, name }>`,
serialised as `null` when absent. Comment-thread replies pass `None`. The sidecar's
`CallContext` reads it as `ctx.file`.

**The fallback lives in `read_tables()`, behind a flag.** When `table_sources()` is empty and
the caller allows it, `read_tables()` tries `ctx.file` if it is a table file, and otherwise
the first table file in `ctx.results()["assets"]` (already newest first). It writes one line
naming the file and the reason before the Trait's own output, then reads it with
`read_table()`, so confinement still goes through `asset.read`. Join Data calls it with the
fallback off. *Alternative:* putting the fallback in each Trait, rejected as five copies of
the same rule.

**Prompt Traits mark the pick in their file list.** `adapters/prompt.py` adds
" — probably the file the user means" to the picked file's line. The model still decides
whether to read it.

**The Rust core owns every decision; the sidecar only asks Jev and reads.** Durable state
does not change: nothing new is stored.

## Risks / Trade-offs

- [Jev is unsure and the newest table is not the one meant] → the reply's first line names
  the file it used and why, so the user can tag the right one and send again.
- [A Conversation with many files makes the `file` Choice long] → the options are capped at
  the 50 `results()` already returns.
- [Asset IDs and names now go to Typesafe] → only IDs and names, which the routing spec
  already allows for tagged files; no content. The Settings text already says the names of
  files are sent.
- [The protocol gains two fields] → the core and the sidecar ship together and the sidecar's
  version is checked at start, so no compatibility handling is needed.
