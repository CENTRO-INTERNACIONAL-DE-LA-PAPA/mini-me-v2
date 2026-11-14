## MODIFIED Requirements

### Requirement: Starting a Mini-Me run
The core SHALL start a run with `run.start`, payload `{ run_id, mini_me, workflow, traits,
model, input, context, resume }`:
- `run_id` is a new UUIDv7, and `mini_me` is `{ id, name }`;
- `traits` lists `{ id, name, instructions, adapter }` for each Trait the Workflow uses;
- `model` is `{ provider, model }` from Settings, or `null`; for the provider `custom` it is
  `{ provider, model, endpoint, api_format }`, with `api_format` `"openai"` or `"anthropic"`;
- `input` is the input of every Trait Step;
- `resume` is `null`, or the saved state to resume from.

#### Scenario: Traits of a run
- **WHEN** the core starts a run of Investigator
- **THEN** `traits` lists *Scout*, *Wonder*, *Plan*, *Refute* and *Experiment*, each once,
  and `resume` is `null`

#### Scenario: Tools of a Trait
- **WHEN** the core starts a run of Assistant
- **THEN** *Assist*'s entry in `traits` has no `tools`

#### Scenario: Custom model in a run
- **WHEN** the provider is Custom and the core starts a run of Scribe
- **THEN** `model` carries the saved `endpoint` and `api_format`; for any other provider
  `model` has neither field

### Requirement: Link protocol version
The link protocol version SHALL be 17. The Rust core and the sidecar both implement adapter
discovery, Mini-Me runs (`run.start`, `run.cancel` and the `run.*` and `step.*` frames), the
routing request, the summary request (`summary.start`, `summary.done` and `summary.error`),
and the `component.add`, `asset.write`, `conversation.results` and `component.read`
requests, with `current` Assets, component `preview`, `source_asset_id` and `source`, hidden
files and Traits without tools, and without `component` Text Components. A side still at an earlier version SHALL be reported as a version
mismatch.

#### Scenario: Old sidecar
- **WHEN** a development build's core implementing version 17 starts a sidecar that sends
  `hello` with protocol 16
- **THEN** the sidecar is shown as `incompatible`, naming both versions
