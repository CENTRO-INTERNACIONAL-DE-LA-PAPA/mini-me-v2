# Design

## Context

PR #51 gave the app a sidebar shell with a Files screen; opening a Project currently shows
"Select or create a conversation." Everything the Overview shows already lives in
`project.sqlite`: Conversations (`last_activity_at`), messages with their authors,
Interactive Components (`components`, linked to their message) and Assets (`assets.source`
is `upload` or `generated`). `assets::project_files` already works out which message first
attached an Asset and so which Mini-Me saved it. Model calls only happen in the sidecar; the
one call the core makes outside a reply is routing, through `route.start` and its single
answer (`routing.py`, `Runs::route`).

## Goals / Non-Goals

**Goals:**
- One Overview screen per Project, built from data the core already stores, plus two new
  pieces of Overview state: the summary and the featured component.
- A summary written by the user's own model only when they ask, with no new service.
- Keep durable state in the Rust core; the sidecar only makes the model call.

**Non-Goals:**
- Hypotheses (issue #63), automatic or scheduled summaries, editing the summary by hand,
  featuring more than one output, or featuring kinds other than charts and tables.

## Decisions

### Ownership by process
- **Rust core:** the schema migration, the Overview query (header counts, summary, featured
  component with its data, outputs), featuring and unfeaturing, building the summary's
  material, sending `summary.start` and storing the answer.
- **Sidecar:** answers `summary.start` with one model call. It keeps nothing.
- **UI:** the Overview screen, the sidebar item, the "Feature on Overview" button, and
  scrolling a Conversation to a reply.

### Storage: one `overview` row per Project
Migration 4 adds `overview (id INTEGER PRIMARY KEY CHECK (id = 1), summary TEXT,
summary_at INTEGER, featured_component TEXT REFERENCES components(id))`. A single-row table
keeps the Overview's own state apart from Conversations and makes "replacing" the featured
component a plain update. Alternative considered: a `featured` flag on `components`; rejected
because only one component per Project may be featured and the flag would need clearing in
every other row.

### The summary call mirrors routing
`Runs::summarize(model, material, timeout)` sends `summary.start { summary_id, model,
material }` and waits for `summary.done` or `summary.error`, exactly like `Runs::route`. In
the sidecar a `Summarizer` (next to `Router` in `app.py`) gets the key with `secret.get`,
builds the chat model with `providers.chat_model`, sends one system prompt (the
`RESEARCH_CONTEXT` sentence and instructions for a summary of at most 60 words in 2 or 3
sentences, findings first and then pending work, with no retelling of the Conversations, in
the language of the material) and the material, and maps provider errors
and content-filter endings with the same functions the `prompt` adapter uses, so failures
read as they do for replies. Alternative considered: running a hidden *Summarize* Mini-Me in
a hidden Conversation; rejected because it would create messages and events the user never
sees and does not fit the event log. The link protocol goes to 7 because older sidecars do
not know `summary.start`.

The IPC command `update_overview_summary` runs on a blocking thread so the UI stays
responsive; it fails with `model_not_set` when Settings has no model, before anything is
sent. The timeout is generous (120 s), since a long material can take a while.

### Summary material
Built in Rust from stored messages: per Conversation, `## <title>` followed by
`You:` / `<Mini-Me name>:` lines with each message's content (Text Components keep their
labels), newest Conversation first, adding whole Conversations while the total stays within
`HISTORY_BUDGET_CHARS` times four (200,000 characters), close to the prompt adapter's
material limit. No file contents or component data are included, only component `text`
when a message has no text of its own.

### Outputs query
One query per kind, merged and sorted by `created_at` descending in Rust:
- components joined to their message and Conversation, `kind != 'approval'`, author from the
  message;
- `generated` Assets, author and Conversation from the first message that attaches them
  (the same rule as the Files screen).
Each output carries `{ kind, id, title, mini_me_id, conversation_id, conversation_title,
message_id, created_at }`. Titles: a chart's or table's `title` (else "Table"/"Chart"),
"<n> papers", "<n> theories", or the file name. The core returns all outputs; the UI shows
six and the rest behind "Show all", as agreed with the user. Component `data` is only
returned for the featured component, so the list stays small.

### UI
- `View` gets `{ kind: "overview" }`, the default after opening a Project; the sidebar gets
  "Overview" above Files.
- `OverviewView` uses existing pieces: `InteractiveComponent` for the featured output,
  `MiniMeAvatar` and Mini-Me colours for cards, `formatRelative` for times, and shadcn
  `Button`/`Card`.
- "Feature on Overview" is an icon button in the chart and table card headers
  (`aria-pressed` when featured). The featured component ID comes from the Overview query and
  is refreshed after featuring.
- Opening a card navigates to `{ kind: "conversation", id, messageId }`; `ChatView` scrolls
  that reply into view once the Conversation has loaded.

## Risks / Trade-offs

- **Data sent to the provider:** the summary sends message text from every recent
  Conversation in one call. → Only on click, and the button's tooltip says what is sent.
- **Stale summary:** it does not follow new messages. → The "Written <time>" line shows its
  age next to "Update summary".
- **Schema upgrade:** Projects opened by this version cannot be opened by older ones. → As
  with every migration; release notes mention it.
- **Large Projects:** the outputs query reads every component row. → Only IDs, kinds,
  titles and authors are read; `data` is parsed only for chart and table titles and the
  featured component.
