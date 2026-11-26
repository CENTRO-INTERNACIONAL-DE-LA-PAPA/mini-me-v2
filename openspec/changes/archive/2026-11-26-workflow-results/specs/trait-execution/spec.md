# Spec Delta

## ADDED Requirements

### Requirement: Summary frame
Before asking the model for a multi-Step run's summary, the sidecar SHALL send `run.summary`,
payload `{ run_id, call_id }`, with a new `call_id`. The core SHALL let that call get the run's
AI key, as for a condition's decision, and SHALL persist no event for it. The summary's text
SHALL then arrive as `run.delta` frames.

#### Scenario: Summary call
- **WHEN** a run of Investigator ends in the sidecar
- **THEN** the core receives `run.summary`, then the summary as `run.delta`, then `run.done`

## MODIFIED Requirements

### Requirement: Step frames
The sidecar SHALL send `step.started` (`{ run_id, step_id, call_id }`) and `step.completed`
(`{ run_id, step_id, output }`) for each Step it runs. `call_id` is a new UUID for each
Trait call, each model decision of a condition or loop and each approval whose questions the
model writes, and `null` for other Steps. An approval Step SHALL get `step.started` only.

#### Scenario: Trait Step
- **WHEN** a run's *Plan* Step runs
- **THEN** the core receives `step.started` with a `call_id`, then `step.completed` with
  *Plan*'s text as `output`
