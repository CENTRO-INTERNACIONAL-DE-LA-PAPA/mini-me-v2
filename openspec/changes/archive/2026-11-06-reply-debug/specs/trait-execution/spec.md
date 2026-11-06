# Spec Delta

## ADDED Requirements

### Requirement: Reply debug records on the link
`run.start`'s `context` SHALL include `debug`, `{ input, details, tools }`, each `true` only
while Developer mode and its switch ("Show what the AI read", "Show model call details", "Show
tool calls") are on. While any of them is `true`, the sidecar SHALL send each model call and,
when `tools` is `true`, each tool call of the run as `run.debug`, payload `{ run_id, entry }`,
where `entry` is the record's `content` with only the parts that are `true`. While all three
are `false`, the sidecar SHALL send no `run.debug`. The core SHALL store each `entry` as the
next `reply` record of the run's reply, and SHALL ignore a `run.debug` for a run that is not
open.

#### Scenario: Collecting only the details
- **WHEN** the core starts a run with `context.debug` `{ input: false, details: true, tools:
  false }`
- **THEN** each `run.debug` entry is a model call with `messages` `null`, and none is a tool
  call

#### Scenario: Debugging off
- **WHEN** the core starts a run with all three `context.debug` values `false`
- **THEN** the sidecar sends no `run.debug` for that run
