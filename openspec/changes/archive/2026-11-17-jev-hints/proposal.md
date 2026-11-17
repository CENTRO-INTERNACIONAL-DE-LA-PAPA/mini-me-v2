# Proposal

## Why

Jev knows each Mini-Me only by its description, so a Mini-Me with a vague description is picked
poorly, and its answer gives the answering model no hint about which table or chart the user
means or which tools fit the message. Now that every model is offered every tool, a short hint
helps the model choose without taking any tool away. This is change 4 of 5 of
`docs/plan-components-tools-routing.md`.

## What Changes

- **Trait names in Jev's Mini-Me options.** Each `mini_me` option reads the Mini-Me's name, its
  description and the names of its Traits, added automatically.
- **New `component` question.** Asked when the Conversation has tables or charts and the
  message is not a comment: one option per table or chart, by kind, title and source file, plus
  `none`. A pick at or above the threshold reaches the run as `context.component`, and the
  model's list of Interactive Components marks it as the one the user probably means.
- **New `tools` question.** Asked for every message that is not a comment: one option per model
  tool except hand-off, plus `none`. The four most probable tools reach the run as
  `context.tools`, and the model's request says "Likely useful: …". The model is still offered
  every tool.
- **BREAKING** for the link: `route.start` carries Trait names and component options, and
  `run.start` carries `context.component` and `context.tools` (protocol 19).

Out of scope: `next_mini_me`, hand-offs made by the run engine, telling a call which Traits come
after it, and hand-off chains (the next change, `hand-off-chains`); Trait names in the model's
list of Mini-Mes to hand off to; several files or components in one message.

No new external service, credential or cost: the questions are part of the one Jev request each
message already makes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `routing`: the `mini_me` options name each Mini-Me's Traits; Jev is also asked `component`
  and `tools`; the picks are passed on to the run; `route.start` carries the new options.
- `tool-use`: the model's request marks the picked component and lists the likely tools.
- `trait-execution`: link protocol version 19.

## Impact

- Rust core: `routing.rs` (questions, component options, decision), `link.rs` (`RouteMiniMe`,
  `route.start`, `RunContext`), `store.rs` (the Conversation's tables and charts with their IDs
  and source names), `runs.rs` (passing the picks to the run).
- Sidecar: `routing.py` (option texts for Trait names, components and tools),
  `context.py`, `adapters/prompt.py` (marking the component, the "Likely useful" line),
  `link.py` (protocol).
- UI: `jevDebug.ts` shows the new questions in Jev's debug record if it lists questions by name.
- Docs: `docs/architecture.md` where it describes Jev's questions; `CHANGELOG.md`.
