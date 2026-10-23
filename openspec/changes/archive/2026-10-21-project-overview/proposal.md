# Proposal

## Why

A Project's results are scattered across its Conversations: to find the chart that mattered
or the file a Mini-Me saved, the user has to scroll through each one. The Project Overview
(Roadmap #13) gives every Project one page that says where it stands and shows what its
Conversations produced.

## What Changes

- **Overview screen.** Opening a Project shows its Overview, and the Project's sidebar gets
  an "Overview" item above Files. The screen shows "Overview · updated <time> · <n>
  conversations" and the Project's name as its title.
- **Summary on request.** An "Update summary" button asks the AI model chosen in Settings
  to summarise the Project's Conversations in a short paragraph. The summary is saved in the
  Project with the time it was written and shown until the user updates it again. Nothing is
  sent to a model until the button is clicked.
- **Featured output.** A chart or table in a reply gets a "Feature on Overview" button. The
  featured one is shown large under the summary; featuring another replaces it, and it can
  be removed from the Overview. With nothing featured there is no featured block.
- **Latest outputs.** The Interactive Components in replies (not approvals) and the files
  Mini-Mes saved, newest first, as cards tinted in the colour of the Mini-Me that made each
  one. Six are shown, and "Show all" lists the rest. A card opens its Conversation at the
  reply it came from; "Open Files →" opens the Files screen.
- **Link protocol 7.** A new `summary.start` request from the Rust core to the sidecar, with
  exactly one `summary.done` or `summary.error` answer, like `route.start`. The link
  protocol version goes from 6 to 7.
- **`project.sqlite` schema 4.** A migration adds where the summary and the featured
  component are kept.

Out of scope:
- Hypotheses and their status (issue #63).
- Summaries written automatically, on a schedule or as the Conversations change.
- Editing the summary by hand, and featuring more than one output.
- Featuring paper sources, theories or files.

## Capabilities

### New Capabilities
- `project-overview`: the Project Overview screen: its header, the summary written on
  request, the featured output and the Latest outputs grid, and the `summary.start` request
  on the link.

### Modified Capabilities
- `projects`: opening a Project shows its Overview.
- `interactive-components`: chart and table components can be featured on the Project
  Overview.
- `trait-execution`: the link protocol version becomes 7, adding the summary request.

## Impact

- **Cost and data sent:** each "Update summary" is one call to the user's AI provider,
  billed to their account like any reply, and sends the text of the Project's messages (not
  file contents) to that provider. No new external service or credential.
- **Rust core:** a schema migration (version 4), queries for the Overview header and for
  outputs across Conversations, IPC commands to read the Overview, feature or unfeature a
  component and update the summary, and the `summary.start` request in `runs.rs` and
  `link.rs`.
- **Sidecar:** a summary handler like `routing.py`, using the existing provider code in
  `adapters/providers.py`.
- **UI:** an Overview screen and sidebar item, a "Feature on Overview" button on chart and
  table cards, and opening a Conversation at a given reply.
- **Compatibility:** a Project opened by this version is upgraded to schema 4 and can no
  longer be opened by older versions, as with every schema change.
