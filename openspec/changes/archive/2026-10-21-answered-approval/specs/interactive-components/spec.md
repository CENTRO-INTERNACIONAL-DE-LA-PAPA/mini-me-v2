# Spec Delta

## MODIFIED Requirements

### Requirement: Approval component
The data of `approval` version 1 SHALL be `{ step_id, prompt }`, and its `text` the prompt.
The UI SHALL show the component below its reply only while it has no answer and its reply is
`paused`, with the prompt, Approve and Reject. An answered approval, and one whose reply ended
before an answer, SHALL NOT be shown below the reply; the component and its answer SHALL stay
stored.

#### Scenario: Waiting
- **WHEN** a paused reply holds an unanswered approval "Design an experiment to test this
  plan's hypothesis?"
- **THEN** the prompt shows with Approve and Reject

#### Scenario: After approving
- **WHEN** the user approves
- **THEN** the prompt is no longer shown below the reply, also after the Conversation is
  reopened

#### Scenario: Stopped before an answer
- **WHEN** a reply paused at an approval is stopped
- **THEN** no approval prompt is shown below the reply
