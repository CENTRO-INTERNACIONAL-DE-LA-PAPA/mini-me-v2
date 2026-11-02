# Proposal

## Why

A Mini-Me cannot pass part of a request to another one: Assistant, given a table, can only
guess at a profile instead of asking Profiler, and a message that asks for two specialists'
work gets only half of it (#5). Letting a Mini-Me hand work to another, shown on its reply and
answered as if the user had asked, adds no new concept for the user.

## What Changes

- Every prompt-based Trait gets a hand-off tool: the model picks a Mini-Me from the list of the
  library's Mini-Mes, says what to ask, and may pass one of the Conversation's files by ID. The
  sidecar sends it to the core as `reply.hand_off`; nothing is matched by name in the text.
- The core decides whether the hand-off is allowed: once per reply, not to the reply's own
  Mini-Me, not from a reply that a hand-off started, and not in a comment thread. It refuses
  otherwise, and the model reads why.
- An accepted hand-off adds a `hand-off` Interactive Component to the reply: a card with the
  Mini-Me, the request and the file.
- A reply's Interactive Components show once it stops streaming, instead of appearing first
  and being pushed down by the text.
- When the reply completes, the core starts the chosen Mini-Me's reply to it, as if the user
  had sent the request, with the file as its picked file (as in #4) and the Conversation's
  earlier messages.
- Every run carries the list of the library's Mini-Mes, so the link protocol goes from version
  12 to 13.

## Out of scope

- Jev deciding that a message needs a second Mini-Me, and the core starting it after a
  Mini-Me whose reply is fixed (Researcher, Theorist, data Mini-Mes): a follow-up issue.
- More than two Mini-Mes for one message, chains of hand-offs, and more than one hand-off
  per reply (in a Workflow, the first Step to hand off wins).
- Handing off more than one file.

No new external service, credential or cost. The second reply makes one more call to the
user's AI provider when the receiving Mini-Me uses one, as any reply does.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `routing`: the hand-off tool, the `reply.hand_off` request and its checks, and starting the
  other Mini-Me once the reply completes.
- `interactive-components`: the `hand-off` kind, added only by the core; a reply's components
  show once it stops streaming.
- `tool-use`: prompt-based Traits are offered the hand-off tool on every call.

## Impact

- Rust core: `runs.rs` (`reply.hand_off`, the accepted hand-off on the run, starting the
  hand-off reply, the Mini-Me list), `components.rs` (a core-only kind), `link.rs`
  (`RunContext.mini_mes`, protocol 13), `routing.rs` (its "couldn't start" note shared).
- Sidecar: `context.py` (`CallContext.mini_mes`), `tools/hand_offs.py` and `tools/model.py`
  (the tool), `adapters/prompt.py` (offering it), `link.py` (protocol 13).
- UI: a `hand-off` renderer in `src/components/interactive/` and the catalogue.
