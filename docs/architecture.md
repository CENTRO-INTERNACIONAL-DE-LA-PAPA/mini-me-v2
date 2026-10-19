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
 shows a Conversation's           source of truth: project.sqlite,  runs Workflows and
 events and sends commands        events, Assets, secrets, the      Traits; keeps no durable
                                  library, routing, paused runs     state of its own
            ⇅ Tauri commands + an event channel   ⇅ JSON lines on the sidecar's stdin/stdout
```

- **The UI** never touches files, keys or the sidecar. It calls Rust commands (`src/api.ts`
  → `src-tauri/src/ipc.rs`) and subscribes to a Conversation's events.
- **The Rust core** owns everything durable. It starts the sidecar, restarts it when it
  fails, and shows its status (`sidecar.rs`).
- **The sidecar** is a pinned Python environment. In development the core starts it from
  `sidecar/` with `uv run`; release builds bundle a standalone Python with it
  (`npm run bundle-sidecar`).
- **Development builds** (`npm run tauri:dev`) use `src-tauri/tauri.dev.conf.json`, which
  titles the window "Mini-Me (Dev)" and uses the icons in `src-tauri/icons/dev/`, so a dev
  build is easy to tell from an installed one.

## Everything is an event

Every change in a Conversation is an event in `project.sqlite`, with a per-Conversation
sequence number:

| Events | About |
|---|---|
| `message.created`, `message.delta`, `message.progress`, `message.completed`, `message.failed`, `message.cancelled` | a message and its reply's text and status |
| `message.paused`, `message.resumed` | a reply waiting for, then past, an approval |
| `step.started`, `step.completed` | a Workflow Step inside a reply, with its output |
| `attachment.added`, `component.added`, `component.answered` | files and Interactive Components on a message |
| `reaction.added`, `reaction.removed`, `routing.answered` | emoji reactions and Jev's routing answer |

- The core **stores an event before delivering it** (`store.rs`, `ProjectState::persist`)
  and updates the tables derived from it (`messages`, `components`, `reactions`,
  `message_steps`) in the same transaction.
- `paused_runs` is the exception: it holds the saved state of runs waiting for an approval.
  It is operational state, not a projection, so replaying events never needs it, and its row
  is deleted when the approval is answered or the reply is stopped.
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
  "adapter": "asta-paper-finder", "instructions": null, "tools": ["show_papers"] }

{ "id": "…7b04", "name": "Researcher", "description": "Finds research papers on a topic…",
  "colors": { "tint": "#FFE1D8", "solid": "#FF5A36", "ink": "#B3300F" }, "group": "literature",
  "workflow": { "steps": [{ "id": "find-papers", "trait": "…7a04" }] } }
```

- A **Trait** names the **adapter** that runs it and, optionally, the **instructions** that
  adapter follows. Most prompt-based Traits (*Summarize*, *Assist*, *Scout*, *Plan*…) share
  the `prompt` adapter and differ only in their instructions.
- **Placeholder Traits** (*Document*, *Code*, *Predict*…) describe planned capabilities.
  They run on `echo` with no instructions until they are built, and no Mini-Me may use one.
- A Trait's **`tools`** lists what it can read, save and show; see [Tools](#tools). A
  Trait on a fixed adapter lists the tools that adapter's code uses; a prompt-based Trait
  lists the tools its model is offered besides `read_file` and `read_component`, which
  every prompt-based Trait gets. The library refuses unknown tool names, and prompt-based
  Traits listing a tool models cannot use.
- A **Mini-Me** has one Workflow, a list of Steps, each with an `id` unique within the
  Workflow. Most Workflows are a single Trait Step; see [Workflows](#workflows) for the
  others.
- A Mini-Me's **`group`** (`thinking`, `literature` or `data`) is the heading the `@` list
  shows it under. It is required: a missing or unknown group fails the library load.
- When the library loads, `Library::problems()` refuses Workflows that break the rules in
  `openspec/specs/workflows/`: duplicate Step IDs, unknown or placeholder Traits, empty
  lists, branches with fewer than two or duplicate labels, `max_iterations` outside 1 to
  10, and empty questions, prompts or labels. A library test
  (`builtin_library_is_consistent`) runs these checks on `builtin.json`.

**Adding a prompt-based Trait needs no code:** add a Trait with `"adapter": "prompt"`, its
instructions and its `tools`, and a Mini-Me whose Step uses it. Code is only needed for a capability
that no adapter has yet.

## Workflows

A Workflow is nested lists of Steps. A Step without `type` is a Trait Step; the control
Steps are:

| `type` | Fields | What it does |
|---|---|---|
| `approval` | `prompt` | pauses the run until the user approves or rejects |
| `condition` | `question`, `branches` | the model picks one branch by its label |
| `loop` | `question`, `max_iterations`, `steps` | runs `steps`, then the model decides to `repeat` or `stop` |
| `parallel` | `branches` | runs every branch at once and joins their outputs |

A branch is `{ label, steps }`, and every control Step takes an optional `label` for the
progress card. *Investigator* uses all four: Scout and Wonder in parallel, Plan, a
Refute-and-revise loop, then a condition that asks for approval before *Experiment*.

**The core sends the whole run; the sidecar owns its control flow.** `run.start` carries
the Workflow and the Traits it uses, so the sidecar needs no library of its own. The
sidecar's `workflow/` package compiles the Workflow into a LangGraph `StateGraph`
(`graph.py`); LangGraph types appear nowhere else.

- **Trait Steps** send `step.started` with a fresh `call_id`, run the adapter as any call,
  and send `step.completed` with the text the call wrote. Each sees the outputs of earlier
  Steps (`ctx.steps`), except those in other parallel branches, newest kept within 50,000
  characters.
- **Decisions** for conditions and loops (`decide.py`) ask the model for a structured
  answer limited to the branch labels, or to `repeat` and `stop`, under their own `call_id`.
  An answer outside those choices fails with `invalid_decision`.
- **Outputs:** a condition's output is its chosen branch's, a loop's is its last
  iteration's, and a parallel Step's is each branch's under a `## <label>` line. The reply's
  text is the output of the last top-level Step with one.
- **Streaming:** only a *final* Trait Step, one that nothing can follow and that is in no
  loop or parallel branch, streams into the reply (`run.delta`). Any other output reaches
  the reply when the run ends. A one-Step Workflow therefore streams as it always has.
- **Progress:** the UI's `WorkflowProgress` card shows each Step as done, running or
  waiting, and a done Trait Step's output on click. It shows only for Workflows with more
  than one Step or with a control Step.

### Pausing at an approval

1. The approval node calls LangGraph's `interrupt()`. The sidecar serializes the checkpoint
   as `{ format: 1, checkpoint, writes }`, base64-encoded, sends `run.paused` and forgets
   the run.
2. In one transaction the core adds an `approval` component to the reply, stores the run in
   `paused_runs` and persists `message.paused`. The reply reads "Waiting for your approval",
   and the paused run survives closing the app.
3. The user answers through `answer_approval`. **Approve** persists `component.answered`,
   `step.completed` and `message.resumed`, then sends `run.start` with `resume: { state,
   step_id, approved }`. The sidecar loads the checkpoint and continues; a state it can't
   load fails the reply with `resume_failed`. **Reject** completes the reply with the output
   so far.
4. Stop cancels a paused reply too, and a paused reply blocks new messages in its
   Conversation as a streaming one does.

The model is read from Settings when the run resumes, so a model or key changed while the
reply was paused applies.

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
  `adapters/providers.py` builds the LangChain chat model for each provider
  (`chat_model`) and turns provider errors into messages the user can act on.

| Adapter | Runs | What it does |
|---|---|---|
| `echo` | placeholder Traits, tests | streams the input back word by word |
| `prompt` | *Summarize*, *Assist*, *Scout*, *Refute*, *Plan*, *Wonder*, *Experiment* | the Trait's instructions, the Conversation's earlier messages, earlier Step outputs, the message and a list of the Conversation's files and components (IDs, no content), sent to the model chosen in Settings with the read tools and the Trait's tools; the model calls tools for up to 8 rounds before it answers |
| `asta-paper-finder` | *Find Papers* | Ai2's Paper Finder; replies with a `paper-sources` component |
| `asta-theorizer` | *Theorize* | Ai2's Theorizer; replies with a `theories` component and attaches `theory-store.json` |
| `data-profile` | *Profile Data* | describes the referenced tables with pandas, without a model |
| `data-validate` | *Validate Data* | runs default checks and checks the model chooses, with pointblank |
| `data-clean` | *Clean Data* | applies cleaning actions the model chooses and saves the result as a new Asset |
| `data-join` | *Join Data* | joins two tables on key columns the model chooses |
| `data-plot` | *Plot* | draws the charts the model chooses; pandas computes their values (`plot.py`) |

The data adapters live in `adapters/data/` and share `tables.py` (parsing CSV, TSV and
Excel files into pandas), `describe.py` (the description of a table the model sees) and
`preview.py` (`table` component data). They read, save and show through the tools
(`read_table`, `save_file`, `show_table`, `show_chart`). `plot.py` computes each chart type's values, capping
line and scatter charts at 5,000 sampled points. The model only chooses entries from a fixed
catalogue (`catalogue.py`, through structured output in `choose.py`); it never sees rows,
and every result is computed by pandas or pointblank.

Test-only adapters live in `adapters/testing.py` and load only when the sidecar is started
with `--test-adapters`, as the core's tests do.

### What a Trait can do: `ctx`

`CallContext` (`context.py`) is the only way a call reaches the core. Adapters read, save and
show through the [tools](#tools), which use the requests below; adapters call the rest
directly.

| Call | Effect | On the link |
|---|---|---|
| `ctx.write(text)` | appends text to the call's output, streamed into the reply when its Step is final | `run.delta` → `message.delta` |
| `ctx.progress(label, fraction)` | the status line under a streaming reply; at most four per second | `run.progress` → `message.progress` |
| `await ctx.read_asset(id)` | the bytes of a Project file the message references | `core.request` `asset.read` |
| `await ctx.history()` | the Conversation's earlier messages, within a 50,000-character budget | `core.request` `conversation.history` |
| `await ctx.results()` | the Conversation's files and Interactive Components, newest first | `core.request` `conversation.results` |
| `await ctx.read_component(id)` | one component of the Conversation with its full data | `core.request` `component.read` |
| `await ctx.secret(provider)` | an API key or the Ai2 token, for a declared provider only | `core.request` `secret.get` |
| `await ctx.component(kind, version, data, text)` | adds an Interactive Component below the reply's text | `core.request` `component.add` |
| `await ctx.write_asset(name, media_type, data)` | saves a file in the Project and attaches it to the reply | `core.request` `asset.write` |

Frames are one-way. Requests are answered with a result or an error code, which reaches the
adapter as `CoreRequestError`, so an adapter can react to a refusal.

`ctx` also carries the call's Trait (`ctx.trait.instructions`, `ctx.trait.tools`), the message being answered
(`ctx.message`, with its attachments and Text Components), the answering Mini-Me's name,
routing's guess at whether the message needs earlier context (`ctx.needs_context`), and the
outputs of the run's earlier Steps (`ctx.steps`, as `{ step_id, name, output }`).

## A message, from send to reply

For "@Researcher drought in Andean landraces":

1. **Send.** The UI calls `send_message`; the core checks the message's references and stores
   it (`conversations.rs`).
2. **Route.** With an `@` mention, the first mentioned Mini-Me answers. Without one,
   Typesafe's Jev chooses a Mini-Me; when Jev's confidence is below the threshold in
   Settings or Jev cannot be asked, Assistant answers (`FALLBACK_MINI_ME` in `library.rs`).
   Jev also judges whether the message needs earlier context and whether the Mini-Me reacts
   with an emoji (`routing.rs` in the core, `routing.py` in the sidecar).
3. **Start.** The core creates an empty streaming reply and sends `run.start` with the
   Mini-Me's Workflow, the Traits it uses, the model, the message and its context
   (`runs.rs`). A run needs a model if any of its adapters declares providers or if it has
   a condition or loop; without one it fails with `model_not_set` before anything is sent.
4. **Run.** The sidecar compiles the Workflow and runs it in its own error boundary
   (`app.py`, `runs.py`, `workflow/`). Researcher's one Step is *Find Papers*, which gets the
   Ai2 token, calls Paper Finder, writes one line and adds a `paper-sources` component.
5. **Persist and show.** The core turns each frame and request into an event on the reply,
   stores it and delivers it to the UI. `core.request`s carry the `call_id` of the Step
   that sent them, and the core checks them against that Step's Trait.
6. **End.** The sidecar sends `run.done` and the core stores `message.completed`. Stop sends
   `run.cancel`; a run that ignores it is treated as cancelled after five seconds.

Runs execute concurrently; every frame carries its `run_id`, and the core ignores frames
for a run that has ended. `step.completed` ends its call, so a later request from that call
gets `call_not_active`.

## How messages and Mini-Mes are shown

- **Reply text** from a Mini-Me, and an opened Trait Step's output in the progress card, go
  through `src/components/Markdown.tsx`: `react-markdown` with `remark-gfm` (tables,
  strikethrough, task lists) and `remark-breaks` (a single newline is a line break). A small
  plugin there shows raw HTML as text, images are drawn as links and never loaded, and links
  open in the default browser through `openLink`; only `http`, `https` and `mailto` links are
  active. The user's own messages and system notes stay plain text (`segments()`).
- **Text Components** in a reply are rewritten as `[label](ref:N)` links by
  `markdownSource()` (`src/protocol/references.ts`) before parsing, and the link renderer
  draws `ref:N` as the component's chip (`TextComponentChip.tsx`).
- **A Mini-Me named inline** (a mention, an `@` list entry, a reaction tooltip) is always
  `MiniMePill.tsx`: its tint background and ink text, or neutral colours when it is unknown.
- **The composer** keeps a native textarea with transparent text over a layer that draws the
  same text, with picked references as pills. The layer must match the textarea's typography
  and box exactly (`FIELD` in `Composer.tsx`), and its pills use a same-coloured `box-shadow`
  rather than padding so that the text and caret stay aligned.
- **The `@` list** comes from `miniMeSuggestions()`, which matches names ignoring case and
  accents and groups them Thinking, Literature, Data.

## Interactive Components

An Interactive Component is a rich element below a reply's text, such as source cards,
theories or a table. Each kind is hand-coded in the UI and added by its show tool
(`show_table`, `show_chart`, `show_papers`, `show_theories`), so a Trait can add a kind only
when it lists that tool, component data always comes from code we wrote, and it never
contains UI code. The one exception is `approval`, which the core adds itself when a run
pauses and refuses from any Trait.

### A kind is one file

```
src/components/interactive/
  catalogue.ts               lists every kind: { "paper-sources": …, theories: …, … }
  InteractiveComponent.tsx   picks the renderer, or falls back to the text
  links.ts                   web links: which may open, and opening them in the browser
  paper-sources.tsx          export const renderers = { 1: PaperSources }, plus data types
  theories.tsx               Theorize's theories
  table.tsx                  the data Traits' tables and previews of larger ones
  approval.tsx               Approve and Reject buttons for a paused run
  chart.tsx                  Plot's charts: the card, view toggle and legend
  chart-model.ts             chart data types and the controls' state, without the DOM
  chart-plot.ts              Observable Plot options and tooltip lines for each chart type
  chart-figure.tsx           draws the figure with Plot; loaded only when a chart is shown
  *.test.tsx
```

- A kind's file exports `renderers`, a React component for each version, and the
  TypeScript types of each version's data. Renderers get `{ data }`, plus `answer`,
  `projectId`, `messageId`, `componentId` and `replyStatus` for kinds the user answers,
  such as `approval`, and `color`, the solid colour of the Mini-Me that wrote the reply, for
  kinds that draw in it, such as `chart`; the others ignore them. The spec in
  `openspec/specs/interactive-components/` describes the same shape, and the adapter that
  produces it builds it in Python.
- `catalogue.ts` lists the kinds explicitly, so every kind the app knows is in one place. A
  kind that outgrows one file can become a folder without changing anything else.
- A test (`catalogue.test.ts`) reads `builtin.json` and checks that every kind a Trait's
  show tools add has a renderer.

To add a kind: write its file, add it to `catalogue.ts`, add its show tool to
`tools/components.py` and its name to `TOOL_NAMES` (`tools/__init__.py`), `TOOLS`
(`library.rs`) and `SHOW_TOOL_KINDS` (`catalogue.test.ts`), then list the tool on the Trait
that uses it and call it from that Trait's adapter. Nothing changes in the protocol or the
database.

### Adding one to a reply

1. The adapter calls the kind's show tool, such as `await show_papers(ctx, data, text)`,
   once its data is complete; the tool sends `component.add`. Components are not updated
   after they are added.
2. The core checks that the reply is still streaming, that the kind is not `approval`, that
   `data` is at most 2 MiB and that `text` is not empty. It does not check the shape of
   `data`: that is a contract between the adapter and the renderer.
3. **Refused:** the core answers `component_not_allowed` or `invalid_component` and stores
   nothing; the show tool fails with that code. The Asta adapters and Plot then write `text`
   into the reply.
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

- **Handshake:** the sidecar sends `hello` with its protocol version, currently **6**. A
  different version on either side shows the sidecar as incompatible, naming both; in
  development the message also says which side is stale.
- **Core → sidecar:** `adapters.list`, `run.start`, `run.cancel`, `route.start`,
  `core.response`.
- **Sidecar → core:** `hello`, `adapters`, `run.delta`, `run.progress`, `step.started`,
  `step.completed`, `run.paused`, `run.done`, `run.error`, `run.cancelled`, `route.done`,
  `route.error`, `core.request`.
- `src-tauri/fixtures/sidecar-frames.json` holds an example of every frame, and
  `src-tauri/fixtures/events.json` one of every event; tests on both sides parse them.

Bump the protocol version on both sides whenever either side starts relying on a frame,
field or request method the other may not have.

## Tools

A **tool** is one action a Trait takes while it runs. Adapters, tools and `ctx` each have
one job:

| | Adapter | Tool | `ctx` (`CallContext`) |
|---|---|---|---|
| Is | The engine that runs a Trait; what the Trait always does | One action, such as saving a file or showing a table | What the core lets a running call do |
| Decided by | Its own code | Whoever calls it: adapter code, or a model the adapter offers it to | — |
| Lives in | `adapters/` | `tools/` | `context.py` |

An adapter reads, saves and shows only through tools; no adapter calls `ctx.read_asset`,
`ctx.component` or `ctx.write_asset` itself (the test-only adapters in `testing.py` aside).
Every tool acts through `ctx`, so the core's checks and Project-folder confinement apply.

| Tool | Does | Offered to models |
|---|---|---|
| `read_file` | reads a Conversation file: a table's rows (500 at a time) or text (100,000 characters at a time) | always, to prompt-based Traits |
| `read_component` | reads a Conversation component: a table's rows, or another kind's data | always, to prompt-based Traits |
| `read_table` | reads a table file into a DataFrame (data Traits) | no |
| `save_file` | saves a file and attaches it to the reply | as text files (CSV, TSV, TXT, Markdown, JSON) up to 2 MiB |
| `show_table` | adds a `table`, from a DataFrame, from given rows or from a file | yes |
| `show_chart`, `show_papers`, `show_theories` | add a `chart`, `paper-sources` or `theories` | no |

- `tools/__init__.py` names the tools; `files.py`, `tables.py` and `components.py` hold
  them; `model.py` holds the forms offered to models (name, description, JSON Schema).
  `ToolError` (`base.py`) is a `TraitError`: uncaught in an adapter it ends the call with
  its code, and the `prompt` adapter returns its message to the model instead.
- Fixed adapters declare the tools they use (`Adapter.uses_tools`); a test checks their
  Traits list the same ones in `builtin.json`.
- The `prompt` adapter offers `read_file`, `read_component` and the Trait's listed tools
  (`bind_tools`) and loops: the model calls tools, gets their results and continues, for at
  most 8 rounds, then answers. A model that cannot call tools fails with
  `tools_unsupported`.

## Debugging

- **Logs:** `sidecar.log` in the app's log directory (`~/Library/Logs/org.cipotato.mini-me/`
  on macOS, `%LOCALAPPDATA%\org.cipotato.mini-me\logs\` on Windows). Set
  `MINI_ME_LOG_FRAMES=1` to also log every frame, with secrets redacted.
- **Adapters log** with a prefix, such as `[asta]` or `[prompt]`: the shape (never the
  values) of service responses, failed requests and the retries, refused components, and
  empty or filtered model answers.
- **Data:** a Project is a folder with `project.sqlite` and `assets/`; `sqlite3 -readonly`
  on the database shows its events and messages, `message_steps` the Steps of each reply,
  and `paused_runs` the replies waiting for an approval.
- **Jev's answers:** "Show Jev's answers" in Settings stores and shows them under each
  routed message.

## Tests

- Rust unit tests sit at the end of each file in `#[cfg(test)] mod tests`; run them with
  `cd src-tauri && cargo test`. Add `-- --include-ignored` for the tests that start the real
  sidecar through `uv`.
- Frontend tests are `*.test.ts(x)` files next to the code they test; run them with
  `npm test`.
- Sidecar tests use pytest and live in `sidecar/tests/` as `test_<module>.py`; run them
  with `cd sidecar && uv run pytest`. Sample tables for the data Traits are in
  `sidecar/fixtures/data/`. The ignored Rust tests also run the sidecar end to end.
- CI (`.github/workflows/ci.yml`) runs all three suites on every pull request into `dev`
  or `main`: the frontend and sidecar on Linux, and the Rust tests on Windows.
