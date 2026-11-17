# Design

## Context

`Routing` (`routing.rs`) asks Jev about a user message and starts the reply through `Runs`
(`runs.rs`), which it is handed per message. `Runs` accepts `reply.hand_off`, keeps it on the
run, and when the run completes starts the other Mini-Me's reply directly with
`RunSpec::for_mini_me`, without Jev and with `needs_context: true`. It refuses a hand-off from a
reply that answers a Mini-Me's message. `Runs` does not know `Routing`.

The run's context already carries every Mini-Me with its Trait names (`context.mini_mes`, since
`jev-hints`); the prompt adapter lists them by name and description only. The sidecar runs a
Workflow from the Steps in `run.start` and already walks them to find the final Steps
(`final_steps` in `workflow/model.py`).

## Goals / Non-Goals

**Goals:**
- One path for every reply: a user message, a comment and a hand-off are all routed by
  `Routing`, so a handed-off reply gets Jev's hints and can continue the chain.
- Keep each fact in one process: the core decides questions, picks and hand-offs; the sidecar
  words the options and the prompt, and walks the Workflow it runs.

**Non-Goals:**
- Loop prevention or a chain length limit.
- Changing the hand-off tool's arguments or the `hand-off` component.

## Decisions

Settled with the user while planning:

- **A handed-off reply is routed through Jev** with the hand-off's request as the message:
  `needs_context`, `file` (not when the hand-off passes a file), `component`, `tools` and
  `next_mini_me`; in a thread only `needs_context` and `next_mini_me`. Never `mini_me` (the
  target is known) or `reaction` (a reaction belongs on the user's message).
- **The core makes the hand-off for a Mini-Me without a model**, when its reply completes with
  Jev's recommendation and no accepted hand-off. "Without a model" means no Trait of its
  Workflow uses the prompt adapter. No link frame is added; the sidecar's run engine is
  unchanged.
- **Chains have no limit**, and a reply still hands off at most once.
- **`next_mini_me` equal to the answering Mini-Me counts as `none`.**
- **`next_mini_me` asks about what is asked after the first thing.** Jev answers every question
  of the one request on its own, so it doesn't know who answers; asked about "the part the
  answering assistant doesn't cover", it picked the answerer again. A one-part message gets the
  answerer or `none`, both counted as `none`. A second Jev request naming the answerer was
  turned down for its extra wait and cost.
- **A hand-off is recommended when the other Mini-Mes together reach the threshold**, and goes
  to the most probable of them: Jev splits a hand-off between Mini-Mes that could all do it
  (Scribe 47%, Assistant 41%), so no single one reaches it.

Settled with the user after drafting, each the recommended option:

- **How `Runs` reaches `Routing`.** `Routing` registers a hand-off handler on
  `Runs` at startup (as `set_document_gate` is set in `ipc.rs`). Alternative: `Runs` sends
  completed hand-offs over a channel that `Routing` reads on its own thread.
- **Which settings route a hand-off.** The run keeps the `RouteSettings` of the
  routing that started it, so a chain uses the settings of its first message. Alternative: read
  the current settings when the hand-off is routed.
- **Where later Traits are found.** In the sidecar, which runs the Workflow.
  Alternative: the core computes them per Step and sends them in `run.start`.
- **`needs_context` without Jev's answer.** `true`, as today for a hand-off, since
  the request comes from the earlier reply.
- **The file of a hand-off made by the core.** The message's first referenced or
  attached file, else the reply's `context.file`.
- **The prompt lines.** "It's suggested that Scribe handle the part of the request
  you don't cover; hand it off with the hand_off tool if so." (the model doesn't know Jev) and "Your Workflow runs these Traits after
  you: Make Report. Don't hand off their work."

How the work is split between processes:

- **Core: the question and the pick.** `questions` always adds `next_mini_me`; the sidecar
  builds its options from the `mini_mes` already in `route.start`, so the payload does not
  change. `decide` turns the answer into `hand_off: Option<Uuid>` against the threshold and the
  answerer, and `start_reply` sets `RunContext.hand_off`.
- **Core: routing a hand-off.** `Runs`, on a completed run with a hand-off (the model's or its
  own), hands it to `Routing` instead of starting the reply. `Routing` asks Jev with the
  hand-off's questions and starts the reply with the same `start_reply` as for a message. The
  routed "message" is the reply that handed off: Jev's debug record is stored on it, and the
  new reply answers it, as today.
- **Core: hand-offs without a model.** At run completion, `Runs` checks the run's Traits'
  adapters; with no `prompt` adapter and `context.hand_off` set, it builds the hand-off from the
  run's input and file and accepts it as the tool's request would be (same checks, same
  `hand-off` component).
- **Sidecar: words.** `routing.py` adds the `next_mini_me` Choice from `mini_mes`, with the same
  option text as `mini_me`. `prompt.py` names each Mini-Me's Traits in the hand-off list, adds
  the recommendation line when `context.hand_off` is set, and the later-Traits line when the
  call's Step can be followed by Traits.
- **Sidecar: later Traits.** `workflow/model.py` gets a function that, for a Step ID, returns the
  Trait IDs reachable after it, as `final_steps` walks the Steps; the adapter names them with
  the run's Traits.
- **UI.** `jevDebug.ts` gets words for `next_mini_me`; `MessageItem.tsx` shows Jev's block on a
  Mini-Me's message when it has a Jev record.

## Risks / Trade-offs

- [A loop, A → B → A …, runs until the user stops it] → Accepted for now (out of scope); each
  hand-off is visible as a card, and stopping a reply starts nothing.
- [A Mini-Me without a model hands off the whole user message, including the part it did] →
  The next Mini-Me sees the earlier reply in context (`needs_context`) and its own later Traits;
  the plan accepts this.
- [Each hand-off adds a Jev request, so up to 10 s more before the next reply when Typesafe is
  slow] → Same timeout as a message; without an answer the reply starts with no hints.
