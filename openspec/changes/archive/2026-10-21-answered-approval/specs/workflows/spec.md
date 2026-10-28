# Spec Delta

## MODIFIED Requirements

### Requirement: Workflow progress in the reply
A reply whose Workflow has more than one Step SHALL show a Workflow progress card above its
text. The card SHALL list the Steps started so far, in order: each running Step as running,
each completed Step as done, and the Step paused at an approval as waiting. A completed
condition or loop Step SHALL show its outcome after its name, and a completed approval Step
its answer, "approved" or "rejected", taken from the approval it asked. Opening a done
Trait Step SHALL show its output. A one-Step reply SHALL show no card.

#### Scenario: Run in progress
- **WHEN** Investigator has finished its parallel Step and *Plan* is running
- **THEN** the card shows *Scout*, *Wonder* and the parallel Step as done, and *Plan* as
  running

#### Scenario: Reading an earlier output
- **WHEN** the user opens *Scout* in the card of an ended Investigator reply
- **THEN** the card shows the text *Scout* wrote

#### Scenario: An answered approval
- **WHEN** the user approves Investigator's approval and the reply goes on
- **THEN** the card shows the approval Step as done, followed by "· approved", also after
  the Conversation is reopened
