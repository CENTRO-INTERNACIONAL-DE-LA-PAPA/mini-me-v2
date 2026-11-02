# Proposal

## Why

Every new Conversation keeps the same default title, so the sidebar fills with look-alike rows
(#86). A short title that says what each one is about makes them easy to tell apart.

## What Changes

- As soon as the first message of a new Conversation is sent, while the reply is still being written,
  the AI model chosen in Settings writes a short title from that message. It is set once and shown in
  the sidebar and the header.
- A title the user set is never replaced, and later messages never rename it.
- Without an AI model or a key, or when the model fails, the default title stays and nothing fails.
- The summary request on the link gains a `kind` (`overview` or `title`), so the same request writes
  either text. The link protocol version rises by one.

Out of scope: renaming again after later messages, and naming comment threads.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `conversations`: a Conversation is named from its first message.
- `project-overview`: the summary request carries a `kind`.

## Impact

- **Rust core:** a `name_conversation` command and two Conversation functions; `summary.start` carries
  `kind`; protocol version 15.
- **Sidecar:** the summary module writes a title with its own prompt and cleans the answer.
- **UI:** the Conversation view asks for a name right after a message is sent.
- **External services, credentials and costs:** one short call to the user's own AI model per new
  Conversation, within their normal model usage; no new service or key.
