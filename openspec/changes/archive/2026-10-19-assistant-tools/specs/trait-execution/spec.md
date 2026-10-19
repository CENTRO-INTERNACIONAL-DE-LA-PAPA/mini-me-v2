# Spec Delta

## MODIFIED Requirements

### Requirement: Starting a Mini-Me run
The core SHALL start a run with `run.start`, payload `{ run_id, mini_me, workflow, traits,
model, input, context, resume }`:
- `run_id` is a new UUIDv7, and `mini_me` is `{ id, name }`;
- `traits` lists `{ id, name, instructions, adapter, tools }` for each Trait the Workflow
  uses, where `tools` is the Trait's list of tool names;
- `model` is `{ provider, model }` from Settings, or `null`;
- `input` is the input of every Trait Step;
- `resume` is `null`, or the saved state to resume from.

#### Scenario: Traits of a run
- **WHEN** the core starts a run of Investigator
- **THEN** `traits` lists *Scout*, *Wonder*, *Plan*, *Refute* and *Experiment*, each once,
  and `resume` is `null`

#### Scenario: Tools of a Trait
- **WHEN** the core starts a run of Assistant
- **THEN** *Assist*'s entry in `traits` has `tools` `["save_file", "show_table"]`
