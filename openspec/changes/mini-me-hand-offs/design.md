# Design

## Context

See proposal.md for why. The pieces this builds on:

- Prompt-based Traits offer tools to their model (`tools/model.py`), chosen per call in
  `adapters/prompt.py` (`_offered_tools`). Tools act through core requests such as
  `component.add`, which `Runs::answer` handles for the call's run.
- The core adds the kinds only it creates (`approval`, `document-edits`) with
  `conversations::add_core_component`; `components::CORE_KINDS` refuses them from Traits.
- `Routing::start_reply` starts a run that answers a given message. #4's `context.file` is the
  file a data Trait reads when the message references none, and the one prompt Traits see
  marked.

## Goals / Non-Goals

**Goals:**
- The model picks from IDs it is given; nothing is matched by name.
- The core makes every hand-off decision; the run only carries a plain list of Mini-Mes.
- A hand-off is an ordinary reply to an ordinary message, with no new message kind and no
  change to the event protocol.

**Non-Goals:**
- Changing how Jev routes user messages.

## Decisions

**A normal tool, offered on every call.** `hand_off` is one fixed entry of `MODEL_TOOLS`, in
`DEFAULT_TOOLS` with the read tools, so every prompt-based call gets it without listing it. Its
`mini_me` argument is plain text: the Mini-Mes are listed in the prompt ("Mini-Mes you can hand
off to", from `ctx.mini_mes`), as the Conversation's files are for `read_file`. The tool maps
the name back to its ID, refuses an unknown name with the valid ones, and sends
`reply.hand_off { mini_me_id, request, asset_id }`. *Alternative:* an enum of the names in the
tool's form, rejected because it made the tool's form differ per call. Its result tells the model not to repeat
what it already wrote, and its description asks for one short request, since the other
Mini-Me sees the Conversation.

**The core checks, in `reply.hand_off`.** For the call's run it refuses with
`hand_off_not_allowed` when: the run already holds a hand-off; the Mini-Me is the reply's own
or not in the library; the reply answers a message a Mini-Me wrote (a hand-off reply); the
Conversation is a comment thread (`comments::is_thread`); or the file is not one of the
Conversation's (`history::results`). Otherwise it stores `HandOff { mini_me, request, file }`
on the `Run`.

**The card instead of text.** On acceptance the core adds a `hand-off` component with
`add_core_component`: data `{ mini_me_id, request, file }`, text "Handed to <name>: <request>".
`hand-off` joins `CORE_KINDS`. The reply's text is untouched, so `message.completed` and the
store need no change. *Alternative:* appending `@Name request #file` to the reply as Text
Components, rejected because it needed Text Components on `message.completed`, offset
arithmetic and changes in the UI's event store.

**The file as the picked file.** The hand-off reply starts with the handed file as
`RunSpec.file`, so data Traits read it through #4's fallback and prompt Traits see it marked.
One file per hand-off follows from this.

**Starting the reply, like any tool's work, in `runs.rs`.** On `run.done` with a held hand-off,
`Runs` completes the reply and starts the next run itself, as it starts any run: a `RunSpec`
for the chosen Mini-Me from the library, with the request as input, `needs_context:
Some(true)` and the picked file, answering the completed reply, with the model the user chose
in Settings, which the run keeps even when it needed none. A reply that cannot start is
explained under the first reply with routing's existing note (`routing::explain`). Failed and
cancelled runs start nothing. *Alternative:* a hook registered in `ipc.rs` that went through
`Routing` to start the reply, rejected as three files for one step.

**A plain Mini-Me list.** `RunContext.mini_mes` lists every Mini-Me of the library, the same
for every run, built in `Runs::launch` from the library. The core, not the list, rules out the
reply's own Mini-Me.

**Link protocol 12 → 13** on both sides, since `run.start` gains `mini_mes`; the fixture and the
version test move with it.

## Risks / Trade-offs

- [The model calls hand-off where it is not allowed] → the core refuses and the model reads why;
  nothing is shown or started.
- [A model hands off when it should not] → the description says to hand off only work another
  Mini-Me does clearly better; the card shows it and the reply can be stopped.
- [The user sends a message between the first reply completing and the second starting] → the
  second run starts on the same thread right after completion, so the window is short; if a
  message gets in, both replies still run.
