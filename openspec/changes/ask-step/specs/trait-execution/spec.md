# Spec Delta

## MODIFIED Requirements

### Requirement: Pausing a run
At an approval Step, the sidecar SHALL send `run.paused`, payload `{ run_id, step_id,
output, state, prompt }`. `output` is the Workflow's output so far, or `null`; `prompt` is the
questions the AI model wrote for an approval with `questions_by` `"model"`, and `null`
otherwise; and `state` is an
opaque string of at most 16 MiB that holds everything needed to resume. The run then ends in
the sidecar. A larger `state` SHALL fail the reply with `state_too_large`.

#### Scenario: Paused at an approval
- **WHEN** Investigator reaches its approval Step
- **THEN** the core receives `step.started` for that Step, then `run.paused`, and nothing
  else for that run

#### Scenario: Questions written by the model
- **WHEN** a run reaches an approval with `questions_by` `"model"`
- **THEN** the core receives `run.paused` with the model's questions as `prompt`, and the
  approval component shows them

### Requirement: Resuming a run
To resume, the core SHALL send `run.start` with a new `run_id`, the saved Workflow,
Traits, input and context of the paused run, and `resume` `{ state, step_id, approved:
true, text }`, with `text` the written answer sent, or `null` for a yes-or-no approval or a
skipped one. The sidecar SHALL continue after that approval Step, with `text` as its output, or end with `run.error` code
`resume_failed` when it cannot read `state`.

#### Scenario: Approved run
- **WHEN** the core resumes a run paused at Investigator's approval
- **THEN** the next `step.started` is for the *Experiment* Step

#### Scenario: Written answer
- **WHEN** the core resumes a run whose written-answer approval was sent "yield by rainfall"
- **THEN** the approval Step completes with `output` "yield by rainfall", and the next Step
  receives it among the earlier outputs
