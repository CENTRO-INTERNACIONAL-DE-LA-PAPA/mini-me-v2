# Design

## Context

The core decides which questions Jev is asked (`questions` in `routing.rs`), builds the options
it owns (`mini_mes`, `files`) and turns Jev's answers into a `Decision` (`decide`). The sidecar
turns `route.start` into Typesafe Choices and writes each option's text (`routing.py`). A
decision reaches the run through `RunContext` (`needs_context`, `file`), and the prompt adapter
marks the picked file in the model's list of files (`_material` in `adapters/prompt.py`).

## Goals / Non-Goals

**Goals:**
- Add the `component` and `tools` questions and Trait names along the existing path: core
  asks and decides, sidecar words the options, the run carries the picks.
- Keep each fact in one process: the core knows the library and the Conversation's
  components; the sidecar knows the tools and their descriptions.

**Non-Goals:**
- Anything about hand-offs (`hand-off-chains`).
- Changing which tools are offered to a model.

## Decisions

These were settled with the user while planning:

- **The component pick is marked in the list.** `context.component` marks the component in the
  prompt's list of Interactive Components ("— probably the component the user means"), as
  `context.file` marks a file. The `file` options keep listing the tables and charts made from
  each file.
- **Tools options leave out hand-off.** `next_mini_me` (next change) carries the hand-off hint,
  so hand-off as a tools option would repeat it.
- **The top four tools, by probability.** Jev answers one Choice; the hint is the four options
  with the highest probabilities, `none` left out. The model is still offered every tool.

How the work is split between processes:

- **Core: the questions and the picks.** `questions` adds `component` when the Conversation has
  tables or charts and `tools` always, neither in a comment thread. `decide` checks the
  component pick against the threshold and the offered IDs, as for `file`, and takes the top
  four tool names from the `tools` probabilities. The core needs no list of tools for this: it
  reads the option keys Jev answered with.
- **Core: Trait names and component options.** `RouteMiniMe` gains `traits`, filled from the
  library like `name` and `description`. The Conversation's tables and charts with their IDs,
  titles and source file names come from one store query, next to the existing
  `file_components`.
- **Sidecar: option texts.** `routing.py` writes a Mini-Me option as
  "Name: description. Traits: A, B", a component option as "chart 'Yield by variety' from
  field-trial.csv" (kind alone without a title), and builds the `tools` options from
  `MODEL_TOOLS` names and descriptions, leaving out `hand_off`. The tools' descriptions stay
  only in the sidecar.
- **Sidecar: the prompt.** `CallContext` reads `context.component` and `context.tools`.
  `_material` marks the picked component and, when `tools` is not empty, adds
  "Likely useful: show_table, save_file".
- **UI: debug words.** `jevDebug.ts` gets plain words for the two new questions
  ("Which table or chart?", "Likely tools?").

`RunContext` is stored with a paused run; the new fields default to empty when absent, as
`file` does.

## Risks / Trade-offs

- [The `tools` question adds a question to every Jev request] → It is part of the one request
  already made; no extra call or cost.
- [Jev's top four can be poor for an unusual message] → It is a hint; every tool stays offered.
- [Many tables and charts make a long `component` question] → Same as `file` today, which is
  not capped; revisit if Jev's answers get slow.

## Open Questions

Choices made while drafting, each with the recommendation the specs follow:

- **Tools hint when Jev is unsure of everything.** Recommended: always pass the top four,
  whatever their confidence (the specs say so). Alternative: pass none when the top tool is
  below the threshold.
- **Order of a Mini-Me's Trait names.** Recommended: each Trait once, in the order of its first
  Step. Alternative: alphabetical.
- **A Mini-Me option's text.** Recommended: "Name: description. Traits: A, B".
