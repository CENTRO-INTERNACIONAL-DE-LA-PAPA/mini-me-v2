## MODIFIED Requirements

### Requirement: Workflow progress in the reply
A reply whose Workflow has more than one Step SHALL show a Workflow progress card above its
text. The card SHALL list the Steps started so far, in order: each running Step as running,
each completed Step as done, and the Step paused at an approval as waiting. A completed
condition or loop Step SHALL show its outcome after its name, and a completed approval Step
its answer, "approved" or "rejected", taken from the approval it asked. A done Trait Step
with an output or with Interactive Components SHALL open, showing its output followed by
the components that run of the Step added. A one-Step reply SHALL show no card.

#### Scenario: Run in progress
- **WHEN** Investigator has finished its parallel Step and *Plan* is running
- **THEN** the card shows *Scout*, *Wonder* and the parallel Step as done, and *Plan* as
  running

#### Scenario: Reading an earlier output
- **WHEN** the user opens *Scout* in the card of an ended Investigator reply
- **THEN** the card shows the text *Scout* wrote

#### Scenario: An earlier Step's components
- **WHEN** the user opens *Find Papers* in the card of an ended reply, and *Find Papers*
  added paper sources
- **THEN** the card shows the text *Find Papers* wrote, followed by its paper sources

#### Scenario: An answered approval
- **WHEN** the user approves Investigator's approval and the reply goes on
- **THEN** the card shows the approval Step as done, followed by "· approved", also after
  the Conversation is reopened
