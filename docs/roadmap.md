# Roadmap

Mini-Me is built one [OpenSpec](../openspec/) change at a time, in this order. Each change is
proposed, reviewed, implemented, verified and archived before the next one starts.

| # | Change | Scope | Status |
|---|---|---|---|
| 1 | Event protocol and project storage | Event envelope and delivery, Mini-Me Data and Project folders, Conversations, Assets, `#` references, reactions, minimal UI with a temporary echo responder | Done |
| 2 | Sidecar runtime | Bundled Python (pinned with `uv`) started and supervised by the Rust core, JSON lines over stdin/stdout with a version handshake, the Trait interface, the echo responder moved into Python as the first Trait. No API keys or costs. | Done |
| 3 | Releases and auto-update | GitHub Actions builds the Windows per-user installer on each version tag and creates a draft GitHub Release with signed update files; installed apps see it once it is published. Installed apps download updates automatically with progress shown, then ask you to restart (or install when closed). No macOS or Linux release builds: macOS is built locally. Installers are not code-signed: CIP IT allowlists the bundled `python.exe` by path, and the app is named Mini-Me. | Done |
| 4 | First real Trait | AI provider keys in the OS keychain, a Settings screen with provider and model selection, one AI-backed Trait (for example *Summarize*), Mini-Me definitions with the shared Trait library and one-Step Workflows, `@`-mentions of Mini-Mes, optional Mini-Me reactions to your messages | Done |
| 5 | Routing | Typesafe Jev picks a Mini-Me when none is mentioned; below a confidence threshold, you choose | Done |
| 6 | Conversation context | Adapters ask the core for a Conversation's earlier messages when they need them (a `core.request` method, as for Assets), a convention for replies from other Mini-Mes in the same Conversation, a size budget per call, how files referenced in earlier messages are carried over, and Jev deciding whether a message needs previous context at all | Done |
| 7 | Asta integration and Traits | [allenai/asta-plugins](https://github.com/allenai/asta-plugins) pinned in the sidecar, signing in with your Ai2 account, *Find Papers* (Paper Finder) with Researcher and *Theorize* (Theorizer) with Theorist | Done |
| 8 | First Interactive Components | Interactive Components shown below a reply's text: hand-coded, versioned kinds that built-in Traits list and use; Paper sources for *Find Papers* and Theories for *Theorize*; Mini-Mes saving generated files as Assets | Done |
| 9 | Built-in Traits | *Scout*, *Refute*, *Plan*, *Wonder* and *Experiment*, each with its own Mini-Me (Explorer, Skeptic, Planner, Inquirer and Experimenter); the Traits that later changes build join the library as placeholders | Done |
| 10 | Data Traits: inspect and prepare | *Profile Data*, *Validate Data*, *Clean Data* and *Join Data* as tools built into the sidecar, with no code written by the AI model, each with its own Mini-Me (Profiler, Validator, Curator and Linker); a sortable table Interactive Component (selecting and referencing parts of it moved to #14) | Done |
| 11 | Workflow engine | Multi-Step Workflows with control Steps (approval, condition, loop, parallel), stored as data and run as LangGraph graphs in the sidecar, so the link carries a Mini-Me run instead of single Trait calls. A reply shows its Workflow's progress; a run paused at an approval is saved through the core in `project.sqlite`, so it survives closing the app. Investigator, a new built-in Mini-Me, uses all four control Steps | Done |
| 12 | Charts | *Plot* and its Mini-Me, Plotter: the AI model chooses histograms, bar, line, scatter and box charts or correlation heatmaps, and pandas computes their values. A chart Interactive Component drawn with Observable Plot, with hover values, series that can be hidden, alternative chart types and a colour for every series; tables drop TanStack Table | Done |
| 13 | Project Overview | The view of everything a Project has produced: a summary written by the AI model on request, an output the user features from a reply, and the latest tables, charts, papers, theories and files Mini-Mes made | Done |
| 14 | Table selections | Selecting cells, rows and columns in a table Interactive Component and referencing them in a message, which the core resolves so Traits can work on just that part. Each kind of reference has its own sign: `@` for a Mini-Me, `#` for a file and `$` for data, written `$table_name[row_start:row_end,col_start:col_end]`, for example `$field-trial-cleaned[1:20,2:5]` (usually inserted by selecting rather than typed) | Next |
| 15 | Editors and visual Workflow editor | Mini-Me and Trait editors: create, edit, duplicate and delete them, stored app-wide in Mini-Me Data by the Rust core and offered to routing. Built-in Mini-Mes and Traits can only be duplicated; a user-made Trait sets its instructions. The graph editor for Workflows on a canvas, with Step nodes, connectors and an inspector | Planned |
| 16 | Document mode | The *Document* Trait, the document panel with comment threads and Mini-Me edits, PDF export | Planned |

Later: code execution (Python and R) with OS-level sandboxing, collaboration through a relay
server, Microsoft SSO, Dataverse upload, Asta's AutoDiscovery with confirmation before any
action with an extra cost.

