# Design

## Context
The Overview summary already asks the sidecar for one short text from some material, through
`summary.start` (`summary.py`, `Runs::summarize`). A title is the same kind of request with a
different prompt.

## Decisions
- **Reuse the summary request** with a `kind` field instead of adding new frames: one request path,
  one place for the key and the timeout. The protocol version rises to 15.
- **The core decides when to name.** `name_conversation` returns nothing unless the title is still the
  default and the user has sent exactly one message, so only the first message names a Conversation.
  The model gets that message alone, so the title arrives while the reply is still being written.
  The title is written with a compare-and-set on the default title, so a rename the user made in the
  meantime wins.
- **Errors are swallowed.** A missing model or key, or a failed call, returns no title; the default stays.
- **The UI asks right after sending.** The Conversation view calls the command after each send and
  reloads the lists when a title came back, so the sidebar and header update as soon as it is ready.
  A vague first message gives a vaguer title than one made from the reply too; that was traded for
  speed.
- **The sidecar cleans the answer:** first line, no quotes or closing full stop, at most 80 characters.

## Risks / Trade-offs
- One extra short model call per new Conversation. → It uses the user's own model and key.
