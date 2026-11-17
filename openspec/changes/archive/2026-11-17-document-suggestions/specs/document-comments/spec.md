## MODIFIED Requirements

### Requirement: The thread view
The thread view SHALL replace the list in the Comments sheet, with "All comments" to go back,
"N of M open" with buttons for the previous and next thread, the thread's number and where its
passage is ("Hypothesis, bullet 3") with a "…" menu beside them holding Resolve (Reopen once
resolved) and Delete, its comments and replies, and for an open thread a one-line field to
comment with the @ list of Mini-Mes. The field SHALL start empty; every comment gets a reply.

#### Scenario: Replying after Scribe
- **WHEN** Scribe has replied in a thread and the user sends "make it shorter still"
- **THEN** a Mini-Me answers the comment in the thread, picked as for any comment without an
  @-mention

### Requirement: Resolving and deleting threads
Resolve SHALL resolve the thread, which moves it to the Resolved tab and hides its underline and
badge; Reopen SHALL bring it back. Resolving SHALL NOT change any suggestion. Deleting a thread
SHALL ask once for confirmation and then remove the thread, its comments and its replies;
suggestions and files its replies made SHALL stay in the Project.

#### Scenario: Resolve and reopen
- **WHEN** the user clicks Resolve, picks the Resolved tab, opens the thread and clicks Reopen
- **THEN** the thread is listed under Open again with its passage underlined

#### Scenario: Delete
- **WHEN** the user deletes a thread and confirms
- **THEN** it is gone from the Comments sheet and from the Project's database, the `.qmd` file is
  unchanged, and a suggestion a reply in it made still waits in the source

## ADDED Requirements

### Requirement: Every comment gets a reply
Each comment SHALL be answered by a Mini-Me, as a message in a Conversation is: the first
@-mentioned Mini-Me, else the Mini-Me Jev picks for the comment, else Assistant. The reply SHALL
run that Mini-Me's Workflow and stream into the thread, shown with the Mini-Me's name, avatar
and colour. While a reply in a thread is running or waiting for an approval, the thread SHALL
take no other comment, and SHALL offer Stop.

#### Scenario: A comment without a mention
- **WHEN** the user comments "too long" on a sentence
- **THEN** the Mini-Me Jev picks answers in the thread, or Assistant when Jev cannot be asked

#### Scenario: Asking Scribe
- **WHEN** the user comments "@Scribe make this shorter"
- **THEN** Scribe's Workflow runs and its reply appears in the thread as it is written

#### Scenario: An approval in a thread
- **WHEN** the answering Mini-Me's Workflow reaches an approval
- **THEN** the approval is shown in the thread, and the run continues once the user answers it
  there

### Requirement: Thread events
Comments and replies in a thread SHALL be messages with the same events as messages in a
Conversation (`message.created`, `message.delta`, `message.completed`, `message.failed`,
`message.cancelled`, `component.added`, `component.answered` and the others), in the thread's
own sequence. Creating, resolving, reopening and deleting a thread, and moving its anchor, SHALL
be stored in the Project's database without events.

#### Scenario: A reply in a thread
- **WHEN** Scribe answers a comment
- **THEN** the thread's events hold Scribe's `message.created`, its deltas and
  `message.completed`

## REMOVED Requirements

### Requirement: Notes and @-mentions
**Reason**: Comments without a mention are no longer notes; every comment gets a reply.
**Migration**: See "Every comment gets a reply".

### Requirement: Suggested edits
**Reason**: Suggestions no longer live in threads; the suggest tool makes them on the document.
**Migration**: See the `document-suggestions` capability.

### Requirement: Accepting a suggestion
**Reason**: Suggestions are answered in the source, not in a thread.
**Migration**: See "Answering a suggestion in the source" and "Accepting merges with the user's
edits" in `document-suggestions`.

### Requirement: Conflicting suggestions
**Reason**: Moved with suggestions.
**Migration**: See "Accepting merges with the user's edits" in `document-suggestions`.

### Requirement: Comment events
**Reason**: Suggestions are no longer thread events.
**Migration**: See "Thread events".

### Requirement: Threads opened from a Conversation
**Reason**: A suggestion made from a Conversation no longer opens a thread.
**Migration**: Suggestions from any reply appear in the document's source.

### Requirement: Answering a reply's edits at once
**Reason**: The `document-edits` card and its edits bar are removed.
**Migration**: Answer each suggestion in the source.
