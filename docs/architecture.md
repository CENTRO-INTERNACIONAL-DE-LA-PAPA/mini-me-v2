# How Mini-Me works

A guide for developers: the three processes, how a message becomes a reply, and where to
add Traits, adapters and Interactive Components. The terms (Project, Conversation, Mini-Me,
Trait, Workflow, Step, Interactive Component, Text Component, Asset) are defined in the
README's [Core concepts](../README.md#core-concepts) and in `openspec/config.yaml`. The
behaviour each part must have is specified in `openspec/specs/`.

## The three processes

```
 UI (React, Tauri webview)        Rust core                         Python sidecar
 src/                             src-tauri/src/                    sidecar/src/mini_me_sidecar/
 ───────────────────────────      ─────────────────────────────     ─────────────────────────
 shows a Conversation's           source of truth: project.sqlite,  runs Traits; keeps no
 events and sends commands        events, Assets, secrets, the      state of its own
                                  Trait library, routing
            ⇅ Tauri commands + an event channel   ⇅ JSON lines on the sidecar's stdin/stdout
```

- **The UI** never touches files, keys or the sidecar. It calls Rust commands (`src/api.ts`
  → `src-tauri/src/ipc.rs`) and subscribes to a Conversation's events.
- **The Rust core** owns everything durable. It starts the sidecar, restarts it when it
  fails, and shows its status (`sidecar.rs`).
- **The sidecar** is a pinned Python environment. In development the core starts it from
  `sidecar/` with `uv run`; release builds bundle a standalone Python with it
  (`npm run bundle-sidecar`).

## Everything is an event

Every change in a Conversation is an event in `project.sqlite`, with a per-Conversation
sequence number: `message.created`, `message.delta`, `message.progress`,
`message.completed`, `message.failed`, `message.cancelled`, `attachment.added`,
`component.added`, `reaction.added`, `reaction.removed` and `routing.answered`.

- The core **stores an event before delivering it** (`store.rs`, `ProjectState::persist`)
  and updates the tables derived from it (`messages`, `components`, `reactions`) in the same
  transaction.
- The UI folds events into messages (`src/protocol/eventStore.ts`). Replaying a
  Conversation from sequence 1 gives the same view, which is how a reopened Conversation
  looks exactly as it did.
- Events are never edited. A change, such as stopping a reply, is a new event.
- The Rust types (`protocol.rs`) and their TypeScript mirror (`src/protocol/types.ts`) are
  kept in step by one fixture, `src-tauri/fixtures/events.json`, which tests on both sides
  parse.

The database schema is versioned with `PRAGMA user_version`; `db.rs` holds the migrations,
and a Project from a newer app version is refused instead of being changed.

## Traits and Mini-Mes are data

Both are defined in `src-tauri/library/builtin.json`, embedded in the core and read-only for
now (`library.rs`).

```json
{ "id": "…7a04", "name": "Find Papers", "description": "…", "color": "oklch(0.55 0.1 230)",
  "adapter": "asta-paper-finder", "instructions": null, "components": ["paper-sources"] }

{ "id": "…7b04", "name": "Researcher", "description": "Finds research papers on a topic…",
  "colors": { "tint": "#FFE1D8", "solid": "#FF5A36", "ink": "#B3300F" },
  "workflow": { "steps": [{ "trait": "…7a04" }] } }
```

- A **Trait** names the **adapter** that runs it and, optionally, the **instructions** that
  adapter follows. *Summarize* and *Assist* share the `prompt` adapter and differ only in
  their instructions.
- A Trait's **`components`** lists the Interactive Component kinds its answers may include.
  Only built-in Traits list any; see [Interactive Components](#interactive-components).
- A **Mini-Me** has one Workflow. Today every Workflow is a single Step that runs one Trait.
- A library test (`builtin_library_is_consistent`) checks the definitions, such as every
  Step naming an existing Trait.

**Adding a prompt-based Trait needs no code:** add a Trait with `"adapter": "prompt"` and
its instructions, and a Mini-Me whose Step uses it. Code is only needed for a capability
that no adapter has yet.

## Adapters run Traits

An adapter is a Python class in `sidecar/src/mini_me_sidecar/adapters/`:

```python
class FindPapers(Adapter):
    info = AdapterInfo(
        id="asta-paper-finder",            # what a Trait's "adapter" names
        description="Finds papers on a topic with Ai2's Paper Finder.",
        input_schema=TEXT_INPUT,           # JSON Schema of `input`
        providers=("ai2",),                # the only secrets it may ask for
    )

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        ...                                # produces the reply through `ctx`
```

- Register it in the list in `adapters/__init__.py` (`load_adapters`). After the sidecar
  starts, the core asks for its adapters (`adapters.list`) and only starts calls for adapters
  it knows.
- Returning from `run` ends the call as done; raising `TraitError(code, message)` ends it
  with that error; any other exception ends it as `trait_error`, with the traceback in the
  log only. Long work checks `ctx.cancelled` and returns early, and blocking calls go through
  `asyncio.to_thread` so the sidecar keeps answering the core.
- An adapter whose `providers` include an AI provider (`openai`, `anthropic`, `google`,
  `openrouter`) gets the model chosen in Settings as `ctx.model`; others get none.

| Adapter | Runs | What it does |
|---|---|---|
| `echo` | tests only | streams the input back word by word |
| `prompt` | *Summarize*, *Assist* | the Trait's instructions, the Conversation's earlier messages and the message with its text files, sent to the model chosen in Settings |
| `asta-paper-finder` | *Find Papers* | Ai2's Paper Finder; replies with a `paper-sources` component |
| `asta-theorizer` | *Theorize* | Ai2's Theorizer; replies with a `theories` component and attaches `theory-store.json` |

Test-only adapters live in `adapters/testing.py` and load only when the sidecar is started
with `--test-adapters`, as the core's tests do.

### What a Trait can do: `ctx`

`CallContext` (`context.py`) is the only surface an adapter sees.

| Call | Effect | On the link |
|---|---|---|
| `ctx.write(text)` | appends text to the reply | `call.delta` → `message.delta` |
| `ctx.progress(label, fraction)` | the status line under a streaming reply; at most four per second | `call.progress` → `message.progress` |
| `await ctx.read_asset(id)` | the bytes of a Project file the message references | `core.request` `asset.read` |
| `await ctx.history()` | the Conversation's earlier messages, within a 50,000-character budget | `core.request` `conversation.history` |
| `await ctx.secret(provider)` | an API key or the Ai2 token, for a declared provider only | `core.request` `secret.get` |
| `await ctx.component(kind, version, data, text)` | adds an Interactive Component below the reply's text | `core.request` `component.add` |
| `await ctx.write_asset(name, media_type, data)` | saves a file in the Project and attaches it to the reply | `core.request` `asset.write` |

Frames are one-way. Requests are answered with a result or an error code, which reaches the
adapter as `CoreRequestError`, so an adapter can react to a refusal.

`ctx` also carries the call's Trait (`ctx.trait.instructions`), the message being answered
(`ctx.message`, with its attachments and Text Components), the answering Mini-Me's name, and
routing's guess at whether the message needs earlier context (`ctx.needs_context`).

## A message, from send to reply

For "@Researcher drought in Andean landraces":

1. **Send.** The UI calls `send_message`; the core checks the message's references and stores
   it (`conversations.rs`).
2. **Route.** With an `@` mention, the first mentioned Mini-Me answers. Without one,
   Typesafe's Jev chooses a Mini-Me, or the app asks the user to mention one when Jev's
   confidence is below the threshold in Settings. Jev also judges whether the message needs
   earlier context and whether the Mini-Me reacts with an emoji (`routing.rs` in the core,
   `routing.py` in the sidecar).
3. **Start.** The core creates an empty streaming reply, resolves Mini-Me → Step → Trait →
   adapter, and sends `call.start` with `{ call_id, adapter, trait, model, input: { text },
   context }` (`trait_calls.rs`).
4. **Run.** The sidecar runs the adapter's `run` in its own error boundary (`app.py`,
   `runner.py`). *Find Papers* gets
   the Ai2 token, calls Paper Finder, writes one line and adds a `paper-sources` component.
5. **Persist and show.** The core turns each frame and request into an event on the reply,
   stores it and delivers it to the UI.
6. **End.** Returning sends `call.done` and the core stores `message.completed`. Stop sends
   `call.cancel`; a call that ignores it is treated as cancelled after five seconds.

Calls run concurrently; every frame carries its `call_id`, and the core ignores frames for
a call that has ended.

## Interactive Components

An Interactive Component is a rich element below a reply's text, such as source cards or
theories. Each kind is hand-coded in the UI, and only the built-in Traits that list it in
their `components` may add one, so component data always comes from adapters we wrote and
never contains UI code.

### A kind is one file

```
src/components/interactive/
  catalogue.ts               lists every kind: { "paper-sources": …, theories: … }
  InteractiveComponent.tsx   picks the renderer, or falls back to the text
  links.ts                   web links: which may open, and opening them in the browser
  paper-sources.tsx          export const renderers = { 1: PaperSources }, plus data types
  paper-sources.test.tsx
  theories.tsx
  theories.test.tsx
```

- A kind's file exports `renderers`, a React component for each version that gets
  `{ data }`, and the TypeScript types of each version's data. The spec in
  `openspec/specs/interactive-components/` describes the same shape, and the adapter that
  produces it builds it in Python.
- `catalogue.ts` lists the kinds explicitly, so every kind the app knows is in one place. A
  kind that outgrows one file can become a folder without changing anything else.
- A test reads `builtin.json` and checks that every kind a Trait lists has a renderer.

To add a kind: write its file, add it to `catalogue.ts`, list it in the `components` of the
Trait that uses it, and call `ctx.component` from that Trait's adapter. Nothing changes in
the Rust core, the protocol or the database.

### Adding one to a reply

1. The adapter calls `await ctx.component("paper-sources", 1, data, text)` once its data is
   complete. Components are not updated after they are added.
2. The core checks that the reply is still streaming, that the call's Trait lists the kind,
   that `data` is at most 2 MiB and that `text` is not empty. It does not check the shape of
   `data`: that is a contract between the adapter and the renderer.
3. **Refused:** the core answers `component_not_allowed` or `invalid_component` and stores
   nothing. The Asta adapters then write `text` into the reply.
4. **Accepted:** the core stores `component.added` with `{ message_id, component: { id,
   kind, version, data, text } }` and a row in the `components` table, and answers with the
   component's UUIDv7 ID.
5. The UI shows the components below the reply's text, in order. `InteractiveComponent`
   shows `text` instead when the kind or version has no renderer, or when the renderer fails.

`text` is a plain-text version of the component. It also goes into conversation history, so
a Mini-Me that reads earlier messages can refer to a component ("summarize the third
paper"), and it is what an app version without the kind shows.

### Changing a kind

A change that older data still fits can stay in the same version. Otherwise add a version:
a new renderer in the kind's `renderers` for the adapter's new shape, keeping the older ones,
because stored replies keep their version forever. Renderers treat optional fields as
possibly missing; if one still fails, the reply shows the component's `text`.

Renderers follow `DESIGN.md`: hairline borders, radius 10, no fills or shadows, ink links,
theme tokens only. Links open with `openUrl` from `@tauri-apps/plugin-opener`, and only for
`http(s)` addresses.

## Assets

An Asset is a file in a Project, stored in `assets/<asset id>/<name>` and registered in the
`assets` table with its source: `upload` (attached by the user) or `generated` (written by a
Trait). Every path goes through `ProjectPaths::resolve` (`paths.rs`), which refuses anything
outside the Project folder, including through symbolic links.

- **Reading:** `asset.read` returns base64 chunks of up to 1 MiB, only for Assets of the
  call's Project. No file path is ever sent to the sidecar.
- **Writing:** `asset.write` takes a name, a media type and base64 data (at most 32 MiB).
  The core refuses names with path separators, `..`, control characters or characters
  Windows forbids, stores the file, registers it as `generated` and attaches it to the reply.
  If the attachment can't be stored, the file is removed again.

## Secrets and accounts

API keys, the Typesafe key and the Ai2 tokens live in the OS keychain (`secrets.rs`), never
in Project folders, logs or events. The sidecar gets a secret per request with `secret.get`,
and only for a provider its adapter declares; routing may only get the Typesafe key. The core
refreshes the Ai2 access token before it expires (`ai2.rs`), so adapters always get a
current one.

## The link protocol

The core and the sidecar speak newline-delimited JSON frames (`link.rs`, `link.py`). The
sidecar keeps the original stdout for frames and sends all other output to stderr, which the
core writes to `sidecar.log`.

- **Handshake:** the sidecar sends `hello` with its protocol version, currently **4**. A
  different version on either side shows the sidecar as incompatible, naming both.
- **Core → sidecar:** `adapters.list`, `call.start`, `call.cancel`, `route.start`,
  `core.response`.
- **Sidecar → core:** `hello`, `adapters`, `call.delta`, `call.progress`, `call.done`,
  `call.error`, `call.cancelled`, `route.done`, `route.error`, `core.request`.
- `src-tauri/fixtures/sidecar-frames.json` holds an example of every frame, parsed by tests.

Bump the protocol version on both sides whenever either side starts relying on a frame,
field or request method the other may not have.

## Tools

Traits have no tools yet. The glossary gives each Trait "a set of tools", but the `prompt`
adapter makes a single model call without any, and the Asta adapters call Ai2's services
directly. When tools are added, they belong in the sidecar, listed per Trait in the library
and bound to the model by the `prompt` adapter, reaching Project files only through `ctx` so
the core's confinement still holds.

## Debugging

- **Logs:** `sidecar.log` in the app's log directory (`~/Library/Logs/org.cipotato.mini-me/`
  on macOS, `%LOCALAPPDATA%\org.cipotato.mini-me\logs\` on Windows). Set
  `MINI_ME_LOG_FRAMES=1` to also log every frame, with secrets redacted.
- **Adapters log** with a prefix, such as `[asta]` or `[prompt]`: the shape (never the
  values) of service responses, failed requests and the retries, refused components, and
  empty or filtered model answers.
- **Data:** a Project is a folder with `project.sqlite` and `assets/`; `sqlite3 -readonly`
  on the database shows its events and messages.
- **Jev's answers:** "Show Jev's answers" in Settings stores and shows them under each
  routed message.

## Tests

- Rust unit tests sit at the end of each file in `#[cfg(test)] mod tests`; run them with
  `cd src-tauri && cargo test`. Add `-- --include-ignored` for the tests that start the real
  sidecar through `uv`.
- Frontend tests are `*.test.ts(x)` files next to the code they test; run them with
  `npm test`.
- The sidecar has no test suite of its own yet; the ignored Rust tests run it end to end.
