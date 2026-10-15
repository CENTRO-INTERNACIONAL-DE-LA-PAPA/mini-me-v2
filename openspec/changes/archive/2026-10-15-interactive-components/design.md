# Design

## Context

See proposal.md for why. The current state that shapes the approach:

- A reply is built from call frames: `call.delta` and `call.progress` become `message.delta`
  and `message.progress`, through `conversations::append_*` in the Rust core. The sidecar
  can already ask the core things during a call (`core.request`: `asset.read`,
  `conversation.history`, `secret.get`), and gets an answer or an error code.
- `call.component` is a reserved frame that the core ignores. `attachment.added` can already
  add an Asset to a reply, and the Asset registry already has the source `generated`.
- Messages are a projection of events in `project.sqlite`, at schema version 1.
  `src-tauri/fixtures/events.json` keeps the Rust and TypeScript event types in step.
- The UI shows a reply's text as plain text, and its attachments as badges.
- The Asta adapters reply in Markdown. `theories_reply` already parses the Theorizer's
  Theory Store (see the archived `asta` design, D5).

## Goals / Non-Goals

**Goals:**

- A new kind is one file and one catalogue line in the UI, a call in an adapter and an
  entry in its Trait's `components`. The core, the protocol and the database stay
  untouched.
- The core stays the source of truth: it stores component data, and a component replays
  like any other event.
- An adapter always gets an answer, so it can fall back to text.

**Non-Goals:**

- Component state that the user changes and that is saved, such as the chosen wording or an
  expanded list. That state lives only in the UI and resets when the Conversation reopens.
- Checking component data against a schema. The adapters that produce it and the renderers
  that draw it share the shape written in the spec and the TypeScript types.

## Decisions

### D1. A component is a core request, not a frame

The UI owns rendering, the Rust core owns checking and storage, and the sidecar owns
producing the data. `ctx.component(kind, version, data, text)` is an async call that sends
`core.request` `component.add` and returns the new ID, or raises `CoreRequestError` with
`component_not_allowed`, `invalid_component` or `call_not_active`.

- **Alternative: the reserved `call.component` frame.** Frames are one-way, so a rejected
  component would vanish silently while the adapter believes it was shown. The request
  reuses the existing request/response machinery and lets the adapter write text instead.

### D2. One file per kind in the UI

Each kind is a file `src/components/interactive/<kind>.tsx` that exports `renderers`, a map
from version to a React component that gets `{ data }`, and the TypeScript types of each
version's data. Its tests sit next to it in `<kind>.test.tsx`. `catalogue.ts` lists the
kinds explicitly (`{ "paper-sources": paperSources, theories }`), so every kind the app
knows is visible in one place; a kind that outgrows one file can become a folder without
changing anything else.

- **Alternative: a folder per kind, found with `import.meta.glob`.** It earned its place
  while each kind also had a `schema.json`; with one file per kind, an explicit list is
  plainer than discovery.

The data shape of each version is written down once, in the spec and in those TypeScript
types; the adapter that produces it builds the same shape in Python. A breaking change adds
a version and keeps the older renderers, so stored components still render.

- **Alternative: a `schema.json` per kind, embedded in the core by `build.rs` and checked
  with the `jsonschema` crate.** It would catch bad data before it is stored, at the cost of
  a dependency, a build step that reads UI files and a second description of every shape.
  Since only adapters we write produce component data (D3), a bug there is ours to fix, and
  the renderer's text fallback (D5) keeps the reply readable meanwhile.

### D3. Traits list the kinds they use

A Trait definition in `builtin.json` gains `components`, the kinds its answers may include
(missing means none): *Find Papers* lists `paper-sources` and *Theorize* lists `theories`.
`component.add` checks the call's Trait: a kind it doesn't list fails with
`component_not_allowed`. It also refuses an empty `text` and `data` larger than 2 MiB with
`invalid_component`. This mirrors how an adapter may only get the secrets of the providers
it declares.

Only built-in Traits list kinds. When users can make their own Traits, their definitions
have no `components`, so a prompt-only Trait never produces data a renderer wasn't built
for. A frontend test reads `builtin.json` and checks that every listed kind has a renderer
for version 1.

- **Alternative: any adapter may add any kind.** Simpler, but nothing would stop a Trait
  from showing a component its answer wasn't designed for, and the library would not say
  which Traits produce what.

### D4. Storage: a `components` table

Migration 2 adds:

```sql
CREATE TABLE components (
    id          TEXT PRIMARY KEY,
    message_id  TEXT NOT NULL REFERENCES messages(id),
    kind        TEXT NOT NULL,
    version     INTEGER NOT NULL,
    data        TEXT NOT NULL,
    text        TEXT NOT NULL,
    created_at  INTEGER NOT NULL
);
CREATE INDEX components_by_message ON components(message_id, created_at);
```

`component.added` inserts a row, and `Message` gains `components: Vec<Component>` (serde
default empty), loaded in event order. `message.created` events already stored have no
`components` field and parse as empty.

- **Alternative: a JSON column on `messages`, like `attachments`.** That is simpler now. But
  `#` references and the Project Overview will look components up by ID across messages,
  which a table with its own key serves directly.

### D5. Rendering in the UI

`MessageItem` shows, in order: the text, the components, the progress line, then the
attachments. `InteractiveComponent` looks up `kind` and `version` in the catalogue and
falls back to the component's `text` (pre-wrapped, muted border) when either is missing. An
error boundary around each component does the same if its renderer throws. The event store
handles `component.added` by appending to the message's `components`.

- **`paper-sources`:** cards built from the shadcn Card styled to DESIGN.md. Each card shows
  title, up to three authors with "et al.", year and venue, and the reason clamped to three
  lines. A card with an `http(s)` URL is a button that calls `openUrl` from
  `@tauri-apps/plugin-opener`, which the `opener:default` permission already allows for web
  URLs. "Show all sources (N)" toggles the rest, and "Show fewer" collapses them again.
- **`theories`:** each theory is a section with its number and name, a Select ("Plain
  language" / "Technical") on the right, and its description. The statements form a list,
  each followed by its evidence in smaller text with `[n]` citations. The references are
  listed once under all theories, and a citation links to its reference's anchor.

### D6. Writing an Asset

`asset.write` is answered on the request thread, like `asset.read`. The core:

1. Checks the call is active and its reply streaming.
2. Checks `name`: not empty, at most 255 characters, no `/`, `\`, `..`, control characters
   or any of `<>:"|?*`.
3. Decodes base64 (at most 32 MiB).
4. Resolves `assets/<new id>/<name>` through `ProjectPaths::resolve`, writes the file, and
   inserts the registry row with source `generated`.
5. Persists `attachment.added` on the reply.

The insert and the registry code are shared with `assets::import` through one
`register(project, rel_path, name, size, source)` function. If the event can't be
persisted, the file and row are removed again, so no Asset is left unattached.

### D7. Adapters

- **Find Papers:** writes `narrative` when present, otherwise "Found N papers.". It then
  adds `paper-sources` v1 with up to 50 papers: `title`, `authors`, `year`, `venue`, `url`
  (the same link rule as today) and `reason` (from `_relevance`). The component's `text` is
  today's `papers_reply` list. On `component_not_allowed` or `invalid_component`, it writes that
  list instead.
- **Theorize:** `theories_reply` is split into `theories_data(artifacts)`, which builds the
  v1 data (plain and technical wording, evidence with `refs`, references), and a Markdown
  renderer of that data, which becomes the component's `text` and the fallback. The adapter
  writes "The Theorizer formed N theories from M papers." and adds `theories` v1. It then
  calls `ctx.write_asset("theory-store.json", "application/json", json.dumps(artifacts))`.
  A failure there is logged to stderr and the reply still completes.

- **Both adapters:** Paper Finder's `response_text` is cut at its first `---` line. The
  part before it is a one-line verdict ("I found 18 papers that look like perfect
  matches…"), and the rest restates the query. An Asta request that may succeed later (a
  dropped connection, or a 5xx or 429 answer) is tried again after 2 s and 5 s; a refused
  request (4xx) or a timeout is not, since Paper Finder already waits 5 minutes. Starting a
  Theorizer task is never retried, because a lost answer would otherwise start a second
  task. Waiting between tries, and every request of a Theorize call, ends as soon as the
  call is cancelled. Each failure is logged with its type and message, never the token.

### D8. Conversation history

`history.rs` builds each entry's `content` from the message text and each component's
`text`, joined by blank lines. The existing 50,000-character budget then covers it with no
other change.

### D9. Protocol and fixtures

`SIDECAR_PROTOCOL` and the sidecar's `PROTOCOL` become 4. `events.json` gains a
`component.added` example. `types.ts` gains `Component`, `components` on `Message`, and the
event. The `call.component` frame stays parsed as `Unknown`.

## Risks / Trade-offs

- **[An adapter bug stores data its renderer can't draw]** → the renderer's error boundary
  shows the component's `text`, which is always stored, so the reply stays readable until
  the adapter or renderer is fixed. Renderers treat optional fields as possibly missing.
- **[The theories data shape is checked only against a fixture]** → a task runs a real
  Theorist reply before the change is marked done.
- **[Large components slow the Conversation view]** → the 2 MiB cap per component, 50
  papers at most, and the Theory Store kept as an Asset instead of inside the component.
- **[Changing a kind breaks stored replies]** → kinds are versioned and old renderers are
  never removed. The fallback `text` covers a version the UI no longer renders.

## Migration Plan

- Opening a Project runs migration 2. Older app versions then refuse it with
  `schema_too_new`, as with any schema change.
- The link version bump makes a stale development sidecar show as `incompatible`. Restarting
  `npm run tauri dev` rebuilds it, and releases bundle both sides together.
- Rollback: revert the change. Projects already migrated stay at version 2 and need this
  version to open.

## Open Questions

- The exact Card and Select styling follows DESIGN.md during implementation. It changes no
  behaviour in the specs.
