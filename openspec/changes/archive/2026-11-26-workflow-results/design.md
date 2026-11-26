# Design

## Context

See proposal.md for why. Today:

- **Reply text.** The sidecar compiles the Workflow with `final_steps` (`workflow/model.py`): a Trait Step that no other Step can follow streams its text into the reply. When the run ends, `Run.execute` (`runs.py`) writes the last top-level output as a `run.delta` if nothing streamed.
- **Components.** `componentPlaces` (`src/components/chat/WorkflowProgress.tsx`) puts a component under the reply once it ends when it has no `step_index` or belongs to the last Trait Step run; the others stay with their Step. `MessageItem.tsx` draws the progress card, then the reply's text, then those components.
- **Opening a Step.** `WorkflowProgress` keeps the opened Step in its own state and draws its output and components inside the card, below the list of Steps.
- **Step events.** The core persists `step.started` `{ message_id, step_id, type, name }` from the sidecar's `step.started` frame and the run's Workflow (`runs.rs`, `step_started`).
- **Model calls outside Trait Steps.** A condition's decision and an approval's questions get the AI key because their `step.started` frame carries a `call_id`, which the core registers as a decision call (`CallKind::Decision`). A frame for an unknown Step is ignored.

## Goals / Non-Goals

**Goals:**
- The summary is written once, after the run, from the same earlier outputs Steps see, with no extra Step in the Workflow.
- Showing a Step's results is a property of the Step, carried on its events, so the UI decides from the message alone.

**Non-Goals:**
- Changing one-Step Workflows.
- Changing the Steps timeline beside the Conversation.

## Decisions

### Settled with the user

1. **A per-Step setting**, `show_results` on Trait Steps, with a switch in the inspector. Per component kind and model-chosen components were considered.
2. **Every multi-Step Workflow ends with a summary**, with no per-Workflow switch for now. A summary Trait added as a last Step was considered.
3. **A selected Step replaces the reply's text and components**; unselecting it brings the summary back.
4. **Fallbacks:** no summary for one-Step Workflows, after a rejected approval, without an AI model, or when it fails; then the reply ends as today.

### Approach

5. **The sidecar writes the summary.** In a multi-Step run, `compile_workflow` gets no final Steps, so no Step streams. When the run ends without pausing, `Run.execute` sends `run.summary` with a new `call_id`, then asks the model through a new `summarize()` in `workflow/summary.py`, which streams with the provider's chat model as prompt Traits do, and writes each piece as `run.delta`. Its material is the user's message and `visible_outputs` of the whole run. On a `TraitError` or an empty summary, it writes the last top-level output instead, as today.
6. **The core registers the summary's call** on `run.summary`: a decision call with no Step, so the call can get the AI key and nothing is persisted. The reply's text is the deltas it already appends.
7. **`show_results` travels on `step.started`.** The core adds the Step's setting to the persisted event; `MessageStep` gains `show_results`. `componentPlaces` then puts a component under the reply when it has no `step_index`, when its Step run has `show_results`, or when the Workflow had one Step and it is that Step's. A one-Step Workflow is a message whose only Step is a Trait Step.
8. **The selection lives in `MessageItem`.** `WorkflowProgress` takes the selected index and `onSelect`, and no longer draws an opened Step's content inside the card. `MessageItem` draws either the reply's text and own components or, while a Step is selected, that Step run's output and components (`StepComponents`), or an approval's `WrittenAnswer`. Attachments, reactions and notes stay.
9. **The built-in Workflows** set `show_results` on the Steps named in the `mini-mes` delta. Investigator keeps none.

## Risks / Trade-offs

- **[Summary restates or invents]** The model could add numbers the outputs do not hold. → Its instructions say to restate only what the outputs say and to name the Steps it draws on, and not to recommend anything; the numbers remain one click away in each Step.
- **[One more model call]** Every multi-Step reply makes one more call, and its text arrives after the last Step instead of streaming during it. → Accepted with the user; the progress card shows the Steps meanwhile.
- **[Last Step's components]** A user-made Workflow whose last Step adds a chart without `show_results` no longer shows it under the reply. → The chart is in its Step; the author can turn on "Show its results in the reply".

### Settled after drafting

10. **The summary's instructions:** "You write the end of a Mini-Me's reply: a short summary of what its Workflow's Steps found for the user's message. Use only what the Steps' outputs say, keep their numbers as written, and say which Step each finding comes from when it helps. Write a few short paragraphs or a short list, with no title." It reports what was done; it recommends nothing further.
11. **Frame name:** `run.summary` `{ run_id, call_id }`.
12. **While a Step is selected,** the reply's attachments, reactions and notes stay visible; attachments are not tied to a Step today.
13. **A selected Step looks as an opened Step does today:** its name underlined and `aria-pressed`.
