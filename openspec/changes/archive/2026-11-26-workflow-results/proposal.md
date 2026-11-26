# Proposal

## Why

A Workflow reply shows only its last Step: that Step's text is the reply's text and its
components are the only ones under it (#70). For the data Mini-Mes this hides most of the
work: an Exploratory Data Analysis reply shows the last analysis that ran, while the profile,
distributions and correlations sit inside the Steps card, and nothing says what the run found
as a whole. v1 ended its analyses with a written report. This change lets a Workflow show the
results of chosen Steps with the reply, ends every multi-Step reply with a summary of the run,
and lets the user look at one Step at a time.

## What Changes

- A Trait Step may set **"Show its results in the reply"** (`show_results`). Once the run ends,
  that Step's components appear under the reply, and still with their Step.
- Every **multi-Step Workflow reply ends with a summary** the AI model writes from the Steps'
  outputs. The summary is the reply's text and streams in. A one-Step Workflow gets none. With
  no AI model set, or when the summary fails, the reply ends with the last Step's output, as
  today. A rejected approval ends the reply as today.
- For a multi-Step reply, the components under it are those of the Steps that show their
  results, and those added outside any Step; the last Step's components no longer join the
  reply on their own.
- **Selecting a Step** in the reply's Workflow progress shows, in place of the summary and the
  reply's components, only that Step's text and components. Unselecting it shows the summary
  again.
- The Workflow editor's inspector gets the "Show its results in the reply" switch.
- The built-in Exploratory Data Analysis and Diagnostic Analytics Mini-Mes show the results of
  their analysis Steps and of *Plot*.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflows`: the `show_results` Step setting, the summary as the reply's text, the
  `step.started` payload, and selecting a Step in the Workflow progress.
- `interactive-components`: which components appear under a reply once it ends.
- `trait-execution`: a frame that opens the summary's model call.
- `workflow-editor`: the inspector's new switch.
- `mini-mes`: the two data Mini-Mes show their analyses' results.

## Out of scope

- A per-Workflow switch to turn the summary off.
- Showing a selected Step's attachments (saved files) apart from the reply's.
- The other Workflow issues (#29, #118).

## Impact

- **Rust core:** the Trait Step definition and library (`library.rs`), the `step.started`
  payload, registering the summary's call (`runs.rs`, `link.rs`).
- **Sidecar:** no final Trait Step streams in a multi-Step run; after the run, the summary call
  streams into the reply, falling back to the last Step's output (`runs.py`,
  `workflow/graph.py`, a summary prompt next to `workflow/decide.py`).
- **UI:** the reply's own components (`componentPlaces`), the selected Step replacing the
  reply's text and components (`MessageItem.tsx`, `WorkflowProgress.tsx`), the inspector
  switch, the protocol types; `builtin.json`.
- **Protocol:** `step.started` gains `show_results`; a new sidecar frame opens the summary's
  call. No new persisted event type.
- **Cost:** one more model call per multi-Step reply, on the user's own provider.
