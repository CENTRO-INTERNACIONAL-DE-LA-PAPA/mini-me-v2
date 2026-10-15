# Proposal

## Why

Researcher and Theorist return structured results: ranked papers with links, and theories
with plain and technical wording, statements, evidence and cited papers. As text, these
replies are long and hard to scan. A Theorizer run gave about 1.9 MB of data, and its
Markdown reply had to drop most of it. Interactive Components were always planned for
richer answers. Building their foundation now gives the Asta Traits a proper way to show
results, and makes the later tables and charts cheap to add.

## What Changes

- **Interactive Components below a reply's text:** a Mini-Me's reply can carry Interactive
  Components, shown under its text in the order they were added. They are separate from
  Text Components, which stay inline references.
- **Kinds made by hand, used by the Traits that list them:** each kind is one file in the
  UI code with a React renderer for each of its versions, listed in the UI's catalogue. A Trait
  in the library lists the kinds its answers may include, and only built-in Traits list any,
  so component data always comes from adapters we wrote. Adding a kind needs no protocol or
  storage change.
- **Adding a component from a Trait:** an adapter calls `ctx.component(kind, version, data,
  text)` once its data is complete. The sidecar sends this as the `component.add` core
  request. The Rust core checks that the call's Trait lists the kind, that `text` is not
  empty and that `data` is at most 2 MiB, stores the component with a stable UUIDv7 ID,
  and returns that ID. On error the adapter can still reply with
  text. `text` is a plain-text alternative, used in conversation history and wherever the
  kind is not known.
- **Two first kinds:**
  - **`paper-sources`** for *Find Papers*: the first five papers as cards, each opening
    its link in the browser, and "Show all sources" for the rest.
  - **`theories`** for *Theorize*: each theory with a control to switch between plain and
    technical wording, its statements, and their evidence with numbered citations to the
    papers listed below.
- **Generated files:** a new `asset.write` core request lets a Trait save a file into the
  Project. The core registers it as a generated Asset and attaches it to the reply. Theorist
  uses it to keep the Theorizer's full Theory Store as JSON.
- **Asta replies:** Researcher and Theorist write a short text line, then their component.
  Their current Markdown becomes the component's `text`.
- **Link protocol version 4**, for the two new core requests.

## Capabilities

### New Capabilities

- `interactive-components`: the kinds and their versions, which Traits may use them, adding
  a component to a reply, the `component.added` event and its storage, and how the UI shows
  components, including kinds it does not know.

### Modified Capabilities

- `conversations`: a message also carries its Interactive Components.
- `mini-mes`: a Trait lists the Interactive Component kinds its answers may include.
- `trait-execution`: the `component.add` and `asset.write` core requests. `call.component`
  is no longer reserved. The link protocol becomes version 4.
- `conversation-context`: a history entry includes the `text` of the message's components.
- `asta`: *Find Papers* replies with `paper-sources`. *Theorize* replies with `theories` and
  attaches the Theory Store.

## Impact

- **Rust core:** the `components` list on Trait definitions, the `component.add` and
  `asset.write` handlers, a `components` table (schema migration 2), and the new event in
  the protocol fixture. No new dependency.
- **Sidecar:** `ctx.component` and `ctx.write_asset`; the Find Papers and Theorize adapters.
- **UI:** the catalogue loader, the component area under a reply, and the two kinds' renderers.
  Paper links open through the opener plugin, which the app already has.
- **No new external service, credential or cost.**
- **Storage:** existing Projects are migrated when opened. A Project opened in this version
  can't be opened by older versions, as with every schema change.

## Out of scope

- `#` references to an Interactive Component or a selection inside one. Components get
  stable IDs now, but references come with Tables.
- Updating a component after it is added, or streaming its data while a Trait runs.
- Tables, charts and the Project Overview.
- Rendering Markdown in a reply's text.
- Interactive Components in user messages.
- Interactive Components for user-made Traits.
