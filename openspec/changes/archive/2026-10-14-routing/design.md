# Design

## Context

- `routing::send` in the Rust core validates mentions, persists the user message, picks the
  answerer (the first mention, or the Echo stand-in), starts the reply with
  `TraitCalls::start` and adds the keyword reaction. All of this happens synchronously
  inside the `send_message` command.
- `TraitCalls` owns the link sink and the open calls. It answers `core.request` frames by
  looking up `call_id` in its open calls. `secret.get` is allowed only for providers the
  call's adapter declared that also match the call's `model.provider`.
- The sidecar's `Requests` (`context.py`) sends `core.request` for any `call_id`, and
  `app.py` dispatches frames by `type`. The link protocol is version 2.
- `KeychainSecrets` stores keys per AI provider (`PROVIDERS`). `Settings` holds `ai`.
  Settings' UI lists the four providers.
- `recover_interrupted` fails replies left `streaming` when a Project opens.
- Typesafe's Jev is a hosted API (`POST https://api.typesafe.ai/v1/systemone`) with a Python
  SDK, `typesafe-sdk` (pure Python; its dependencies are already in `uv.lock`). A Choice
  question takes `instructions` and `criteria` (option key → description, up to 255
  options). Its answer has `choice`, `confidence` (0 to 1) and `probabilities`.

## Goals / Non-Goals

**Goals:**
- Sending stays instant: the message appears at once, and routing happens in the background.
- The routing decision is a pure function of Jev's answers and the threshold, so it is
  unit-tested without Typesafe.
- Every message without a mention gets an answer: a Mini-Me's reply, or a note asking to
  mention one.

**Non-Goals:**
- Retrying Jev. If it fails, the user is asked to mention a Mini-Me.
- Caching decisions or batching messages.

## Decisions

### D1. Routing runs on a background thread after the message is persisted

`routing::send` validates the message, checks that nothing is pending in the Conversation,
persists the message and returns it. A thread then does the rest:
1. builds the state and the questions;
2. asks the sidecar with `TraitCalls::route`, waiting at most 10 seconds;
3. computes the decision (D4);
4. either starts the reply and adds the reaction, or persists the note asking to mention a
   Mini-Me.

An in-memory set of Conversations with a pending decision makes a second `send_message`
fail with `reply_in_progress` until the decision is made, matching "One reply at a time".
If starting the reply fails, the thread persists the same note with the "unavailable"
wording, so the message is not left silent.

- *Alternative:* waiting inside the command. Rejected: the UI would show nothing for up to
  10 seconds.

### D2. Routing requests in `TraitCalls`

`TraitCalls` gains `routes: HashMap<Uuid, mpsc::Sender<RouteOutcome>>` and
`route(state, mini_mes, ask, timeout) -> Result<Answers, AppError>`. That method registers
the route, sends `route.start`, and waits on the channel with `recv_timeout`.
- **Frames:** `route.done` and `route.error` complete the waiting route; late frames are
  logged and dropped.
- **Disconnect:** the routes are dropped, so the waiting thread sees a closed channel and
  treats it as `unavailable`.
- **`core.request` lookup:** checks open calls first, then routes. A route may only use
  `secret.get` for `typesafe`. Anything else gets `unknown_method` or `secret_not_allowed`.

Routes live in `TraitCalls` because it already owns the sink, the request answering and
the secret checks.

### D3. Link protocol 3

New frames:
- `route.start { route_id, state, mini_mes, ask }` (core → sidecar);
- `route.done { route_id, answers }` and `route.error { route_id, error }` (sidecar → core).

`answers` maps question IDs to `{ choice, confidence, probabilities }`. `CallContext` gains
`needs_context: Option<bool>` (serialized as `null` when unknown). `SIDECAR_PROTOCOL` and
`PROTOCOL` become 3, and `sidecar-frames.json` gets the three frames.

### D4. The decision as a pure function

`decide(answers, mentioned, threshold, library) -> Decision`, where `Decision` is
`{ answerer, reaction, needs_context }`:
- **`answerer`:**
  - with a mention: `Mini(mentioned)`;
  - otherwise, when `mini_me` exists, names a known Mini-Me and has confidence ≥
    threshold: `Mini(id)`;
  - otherwise: `Unsure { reason }`, with reason `low_confidence` or `unavailable`.
- **`reaction`:** Jev's choice when it is not `none` and its confidence ≥ threshold.
- **`needs_context`:** `yes`/`no` → `Some(true/false)`, otherwise `None`.

With no answers at all (Jev unavailable), the decision is `Unsure` with reason
`unavailable`, or `Mini(mentioned)` with no reaction when there is a mention. Unit tests
cover the threshold edge (equal passes), an unknown Mini-Me ID and a mention with no
answers.

### D5. The sidecar's `routing` module

`mini_me_sidecar/routing.py` handles `route.start` in its own task:
1. It gets the key with `Requests.send(route_id, "secret.get", {"provider": "typesafe"})`.
2. It builds the questions:

   | Question | Criteria |
   |---|---|
   | `mini_me` | Mini-Me ID → "Name: description" |
   | `reaction` | `none` → "Most messages: no reaction"; 👍 → thanks or agreement; 🎉 → celebrating a success; ❤️ → warm appreciation |
   | `needs_context` | `yes` → refers to earlier messages ("it", "that", "again", follow-ups); `no` → self-contained |

3. It calls Jev (model `jev-latest`) with `AsyncTypeSafeClient(api_key=…, timeout=8)` and
   `RetryPolicy(max_retries=0)`. The SDK retries twice by default, which could overrun the
   core's 10 seconds. `system_one(state, questions)` returns `ChoiceAnswer`s in
   `response.choices`.
4. It answers `route.done` with each answer's `choice`, `confidence` and `probabilities`.

Errors:
- a `secret.get` refusal is passed through with its code;
- any other exception (all SDK errors derive from `TypeSafeError`) becomes `route.error` with
  code `jev_unavailable` and a message without the key ("Typesafe could not be reached").

Routing is not an adapter: it produces no reply and is not discovered.

### D6. The note asking to mention a Mini-Me

`conversations::system_reply(project, conversation_id, reply_to, content)` persists one
`message.created` with author `{ kind: "system", id: "routing" }`, status `complete` and
`reply_to` set, so the note needs no new event type and replays like any message. The
wording names the first Mini-Me in the library other than Echo as the example ("@Scribe"):
- `low_confidence`: "Not sure which Mini-Me should answer this. Mention one with @, for
  example @Scribe.";
- `unavailable`: "Couldn't choose a Mini-Me: Typesafe is unavailable or has no key in
  Settings. Mention one with @, for example @Scribe.".

`MessageItem` shows the `routing` system author as "Mini-Me" with a neutral mark.

### D7. Settings

- **Threshold:** `Settings` gains `routing: { threshold: f64 }` (`#[serde(default)]`, 0.5).
  The new command `set_routing_threshold(threshold)` clamps it to 0..=1, and
  `get_ai_settings` also returns `threshold`.
- **Keys:** keychain accounts are the four providers plus `typesafe`, so `is_provider` stays
  the check for the AI model, and a new `is_key_account` gates the keychain.
- **UI:** a Typesafe key row (the same `KeyRow`), and a "Routing" section with a number field
  (step 0.05) explaining that below this confidence Mini-Me asks you to choose.

### D8. UI states

- While a decision is pending, the UI shows "Choosing a Mini-Me…" under the message: the
  message sent from this view, until a reply to it exists (tracked in memory, so reopening
  a Conversation never shows a stale status). Sending is disabled meanwhile; there is no
  reply to stop yet.

### Process ownership

- **Rust core:**
  - the routing flow and the decision;
  - the pending set;
  - persisting reactions and the note asking to mention a Mini-Me;
  - the threshold setting;
  - the Typesafe key and its `secret.get` checks.
- **Sidecar:** the Jev request itself; it holds nothing after answering.
- **UI:** the status line.

## Risks / Trade-offs

- [Every reply now waits for Jev, mentions included] → Jev is built for fast structured
  answers, but its latency isn't documented. If it adds noticeable delay with mentions, a
  follow-up can start mentioned replies at once and add the reaction later. That would
  drop `needs_context` for them, which is still unused.
- [The SDK's API differs from the documented examples] → the first task installs it and
  checks the client, async support and exception classes before the module is written.
- [Messages go to Typesafe] → stated in the README. Only the message text and file names
  are sent.
- [Jev's pricing is unknown] → the user's own account; noted in the README.
- [Keyword reactions disappear, so no key means no reactions] → accepted, since reactions
  are optional.

## Migration Plan

`settings.json` gains `routing` with serde defaults. No Project data changes. Protocol 3
affects development only (a stale sidecar shows as `incompatible`). A message whose
routing was cut short by the app closing stays without a reply; the user sends it again.
