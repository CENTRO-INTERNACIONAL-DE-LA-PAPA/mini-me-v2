# Proposal

## Why

A reply hands off only when its model decides to, so a Mini-Me without a model (Researcher runs
only Find Papers) never hands off, and a model can hand off work its own Workflow's later Steps
will do. A reply a hand-off started can't hand off again, so a request that needs three
Mini-Mes stops after two. This is change 5 of 5 of `docs/plan-components-tools-routing.md`.

## What Changes

- **New `next_mini_me` question.** Asked in every Jev request: one option per Mini-Me, written
  like the `mini_me` options, plus `none`. A pick at or above the threshold that is not the
  answering Mini-Me reaches the run as `context.hand_off`.
- **Jev's recommendation in the model's request.** A prompt-based Trait's request tells the
  model to hand off to the recommended Mini-Me with the hand-off tool. The list of Mini-Mes to
  hand off to names each Mini-Me's Traits.
- **Later Traits.** Each prompt-based Trait call is told which Traits its Mini-Me's Workflow can
  still run after it, so it does not hand off work a later Step will do.
- **Hand-offs for Mini-Mes without a model.** When a reply whose Workflow has no prompt-based
  Trait completes with Jev's recommendation, the core makes the hand-off itself, with the
  reply's input as the request and the message's file or Jev's file pick.
- **Chains.** A handed-off reply asks Jev too, with the hand-off's request as the message: the
  `needs_context`, `file` (not when the hand-off passes a file), `component`, `tools` and
  `next_mini_me` questions, never `mini_me` or `reaction`. A handed-off reply may hand off
  again. A reply still hands off at most once; chains have no length limit.
- **Jev's debug block on handed-off replies.** With "Show what Jev was asked" on, the reply that
  handed off shows the Jev request made for the next reply.
- **BREAKING** for the link: `run.start` carries `context.hand_off` (protocol 20).

Out of scope: preventing loops (A hands off to B, B back to A); several files or components in
one message; hand-offs to more than one Mini-Me per reply.

No new external service, credential or cost: `next_mini_me` is part of the one Jev request a
message already makes. A chain makes one more Jev request per hand-off.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `routing`: Jev is also asked `next_mini_me`; its pick is passed on as `context.hand_off`; a
  handed-off reply is routed through Jev; hand-off chains are allowed; the core hands off for
  Mini-Mes without a model; the model is told Jev's recommendation, each Mini-Me's Traits and
  its Workflow's later Traits.
- `trait-execution`: link protocol version 20.

## Impact

- Rust core: `routing.rs` (the `next_mini_me` question and pick; routing a handed-off reply),
  `runs.rs` (chains, hand-offs made by the core, starting a handed-off reply through routing),
  `link.rs` (`RunContext.hand_off`, protocol), `ipc.rs` (wiring routing to runs).
- Sidecar: `routing.py` (`next_mini_me` options), `context.py`, `adapters/prompt.py` (the
  recommendation line, Trait names in the hand-off list, later Traits),
  `workflow/model.py` (the Traits reachable after a Step), `link.py` (protocol).
- UI: `jevDebug.ts` (words for `next_mini_me`), `MessageItem.tsx` (Jev's block on a Mini-Me's
  message).
- Docs: `docs/architecture.md` where it describes Jev and hand-offs; `CHANGELOG.md`.
