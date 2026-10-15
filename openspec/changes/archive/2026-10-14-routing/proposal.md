# Proposal

## Why

A message without an `@`-mention always goes to the Echo Mini-Me, and reactions come from a
fixed keyword list. Both were stand-ins for Typesafe's Jev. With Jev, Mini-Me picks the most
suitable Mini-Me for each message; when Jev is not confident enough, it asks the user to
mention one.
The same request also decides on a reaction and whether the message needs earlier context.
Change 6 will use that context answer.

## What Changes

- **Typesafe key:** Settings gains a "Typesafe" row next to the AI provider keys. The key is
  stored in the OS keychain the same way.
- **One Jev request per user message**, sent by the sidecar through Typesafe's Python SDK
  (`typesafe-sdk`, model `jev-latest`), asks up to three Choice questions:
  - **Which Mini-Me answers:** only when the message mentions none. The options are the
    Mini-Mes' names and descriptions.
  - **Which reaction:** none, 👍, 🎉 or ❤️. This replaces the keyword rules.
  - **Whether the message needs earlier context:** yes or no. The answer is passed along
    with the call and is unused until change 6.
- **Routing request on the link:** the core asks the sidecar for a routing decision with
  `route.start`, and the sidecar answers with `route.done` or `route.error`. The sidecar
  gets the Typesafe key with `secret.get`, as Traits get theirs. **BREAKING (link
  protocol):** the version becomes 3. Core and sidecar ship together, so users are not
  affected.
- **Confidence threshold:** a Settings value, default 0.5. When Jev's confidence in its
  Mini-Me choice is below it, or Jev cannot be asked (no key, offline, error, timeout), no
  Trait runs. Instead the message gets a short reply from Mini-Me itself asking the user to
  mention a Mini-Me with `@`, saying whether Jev was unsure or unavailable.
- **With a mention:** the mentioned Mini-Me answers. If Jev cannot be asked, the reply goes
  ahead without a reaction.
- The Jev stand-in and its keyword rules are removed.
- **Assistant replaces Echo:** the Echo Mini-Me and *Echo* Trait are replaced by **Assistant**, a
  general research assistant running a new *Assist* Trait on the `prompt` adapter, for
  anything no specialised Mini-Me covers. The `echo` adapter stays for tests.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `routing`: Jev replaces the stand-in for picking the Mini-Me and the reaction. Adds the
  confidence threshold, the reply asking to mention a Mini-Me, the context answer and the
  routing request on the link.
- `credentials`: the Typesafe key is stored and managed like the provider keys, and is
  released to routing requests through `secret.get`.
- `trait-execution`: `core.request` can also come from a routing request; `call.start`'s
  `context` carries `needs_context`; the link protocol version becomes 3; the `echo`
  adapter is no longer used by a library Trait.
- `mini-mes`: Assistant and *Assist* replace Echo.

## Impact

- **Sidecar:** new `routing` module using `typesafe-sdk`, which adds only itself to
  `uv.lock` (its dependencies are already there), and the route frames.
- **Rust core:** `routing` asks the sidecar and applies the threshold. It also handles the
  reply asking to mention a Mini-Me, the threshold setting, and the `typesafe` keychain
  entry. Protocol 3.
- **UI:** the Typesafe key row and the threshold field in Settings, the `routing` system
  author's name, and a "Choosing a Mini-Me…" status while Jev answers.
- **External service:** Typesafe (`api.typesafe.ai`). Each user message's text and the
  names of its attached or referenced files are sent to Typesafe, together with the
  Mini-Mes' names and descriptions. File contents are not sent. The user's own Typesafe
  account is billed as normal usage; Typesafe's documentation does not state pricing. Users
  should not send personal data or unpublished results they are not allowed to share with
  Typesafe; the README says so.
- **Credentials:** one more key in the OS keychain (`typesafe`).

## Out of scope

- Using the context answer (change 6).
- Letting the user pick from a list when Jev is unsure; they mention a Mini-Me instead.
- Showing Jev's probabilities or reasons; per-Mini-Me or per-Project thresholds.
- Routing a message to several Mini-Mes.
