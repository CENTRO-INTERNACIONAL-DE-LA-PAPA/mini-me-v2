# document-comments Specification

## Purpose
Defines comment threads on the passages of a document: notes, Mini-Mes answering @-mentions in
them, suggested edits and how they are accepted, rejected, merged and asked again, and the
comments panel of the document view.

## Requirements

### Requirement: Commenting on a passage
The user SHALL be able to select a passage of a document's source and click Comment, next to the
formatting buttons, which starts a comment thread anchored to that passage and opens its thread
view in the Comments sheet with a field for the first comment. A thread closed before its first
comment is deleted. Further comments in the
thread SHALL answer it. A thread, its comments, its anchor and its state SHALL be stored in the Project's
database; the document's `.qmd` file SHALL NOT change when comments are added, resolved or
deleted.

#### Scenario: First comment
- **WHEN** the user selects "above 3,800 m" in "Trial design report.qmd" and comments "Why only
  2025?"
- **THEN** a thread titled with "above 3,800 m" holds the comment, the passage is highlighted
  in the source, and the `.qmd` file is unchanged

#### Scenario: Replying in a thread
- **WHEN** the user adds "Check the 2024 plots too" to that thread
- **THEN** the thread shows both comments, oldest first

### Requirement: Comment threads are not Conversations
A comment thread SHALL belong to its document and SHALL NOT appear as a Conversation: not in
the sidebar's Conversation list, Home's recent Conversations or "Waiting on you", the Project
Overview's counts, outputs or summary material, the Jobs panel, or Files' "Used in" column.

#### Scenario: Thread and sidebar
- **WHEN** the Project has two Conversations and a document with three threads
- **THEN** the sidebar lists two Conversations, and the Overview counts two

### Requirement: Anchors follow the passage
A thread's anchor SHALL move with its passage as the user edits the source in Mini-Me, and SHALL
be saved with the document. When a document opens and a thread's passage is not where its
anchor says, the thread SHALL be placed on the passage's text if it is found once in the
document; otherwise the thread SHALL be detached, listed under "Detached" with the text it
quoted, and keep its comments.

#### Scenario: Text typed before the passage
- **WHEN** the user types a new paragraph above a commented passage
- **THEN** the thread stays on the same passage, and does after the document is reopened

#### Scenario: Passage removed outside Mini-Me
- **WHEN** the passage is deleted from the `.qmd` in another editor and the document is opened
  in Mini-Me
- **THEN** its thread is listed under "Detached" with the passage's text and its comments

### Requirement: The Comments sheet
The Comments sheet SHALL sit beside the main sheet like the app's other tool sheets, with the
open and resolved counts under its title. It SHALL list the document's threads as rows in the
order of their passages in the source, under Open and Resolved tabs that each show their count,
with detached threads last under "Detached". A row SHALL show the thread's number in the
document, the section its passage is in, its passage on one line, and when it was opened.
Clicking a row SHALL open the thread view.

#### Scenario: A thread's row
- **WHEN** thread 1 is on a passage under the heading "Request"
- **THEN** its row shows 1, "Request", the passage and the time it was opened

### Requirement: The thread view
The thread view SHALL replace the list in the Comments sheet, with "All comments" to go back,
"N of M open" with buttons for the previous and next thread, the thread's number and where its
passage is ("Hypothesis, bullet 3"), who opened it and when with Resolve (Reopen once resolved)
and Delete, its comments and replies, and for an
open thread a one-line field to comment with the @ list of Mini-Mes. The field SHALL start
empty, so a comment is a note unless the user @-mentions a Mini-Me.

#### Scenario: Replying after Scribe
- **WHEN** Scribe has replied in a thread and the user sends "make it shorter still"
- **THEN** the comment is a note, and Scribe is asked only if the user @-mentions it

### Requirement: Passages and number badges in the source
An open thread's passage SHALL show a faint underline and, right after it, a badge with the
thread's number. Clicking the badge or the passage SHALL show the Comments sheet with the thread
view of that thread, which highlights its passage.

#### Scenario: From the source to the thread
- **WHEN** the user clicks the badge showing 2 after "above 3,800 m"
- **THEN** the Comments sheet shows the thread view of the thread on it

### Requirement: Notes and @-mentions
A comment without an @-mention SHALL be a note and SHALL start no Mini-Me. A comment that
@-mentions a Mini-Me SHALL run that Mini-Me's Workflow, as a reply in a Conversation runs; its
text SHALL stream into a reply in the thread, shown with the Mini-Me's name, avatar and colour.
When a comment mentions several Mini-Mes, the first SHALL answer. While a reply in a thread is
running or waiting for an approval, the thread SHALL take no other comment, and SHALL offer
Stop.

#### Scenario: A note
- **WHEN** the user comments "Check the 2024 plots too"
- **THEN** the comment is added and no Mini-Me answers

#### Scenario: Asking Scribe
- **WHEN** the user comments "@Scribe make this shorter"
- **THEN** Scribe's Workflow runs and its reply appears in the thread as it is written

#### Scenario: An approval in a thread
- **WHEN** a mentioned Mini-Me's Workflow reaches an approval
- **THEN** the approval is shown in the thread, and the run continues once the user answers it
  there

### Requirement: What a Mini-Me answering a comment receives
A Mini-Me answering a comment SHALL receive the comment's text without its mentions as its
message, the thread's earlier comments and replies as earlier messages, and the passage as it
is when the run starts, with the name of its document. The document SHALL be readable with the
read-a-file tool during the run. Nothing outside the Project SHALL be read.

#### Scenario: The passage and the document
- **WHEN** Scribe answers "@Scribe make this shorter" on a paragraph of "Trial design
  report.qmd"
- **THEN** Scribe's model is given the paragraph and the document's name, and can read the
  whole document with read-a-file

### Requirement: Suggested edits
A Mini-Me answering a comment SHALL be able to suggest replacement text for the thread's
passage with the suggest-an-edit tool. While a suggestion waits, the source SHALL show the
passage struck through with the suggested text after it, underlined in the Mini-Me's colour, and
the Mini-Me's reply in the thread view SHALL show it with "Accept and resolve", "Try again" and
Discard. Once answered, its text SHALL look like any other text, and the thread's
messages SHALL show it with its decision.

#### Scenario: A pending suggestion
- **WHEN** Scribe suggests "Yield fell above 3,800 m."
- **THEN** the source shows the passage struck through and "Yield fell above 3,800 m." after it in
  Scribe's colour, and Scribe's reply in the thread shows the suggestion with its three buttons

#### Scenario: Discarding
- **WHEN** the user clicks Discard
- **THEN** the source is unchanged, the marks disappear, and the suggestion shows as discarded

### Requirement: Accepting a suggestion
"Accept and resolve" SHALL save the document with the suggestion applied, record the suggestion
as accepted, and resolve the thread. A suggestion SHALL keep the passage text it was based on.
When the passage is still that text, accepting SHALL replace it with the suggested text. When
the user has edited the passage since, accepting SHALL combine the Mini-Me's change with the
user's edits when they change different parts of the passage.

#### Scenario: Accepting after a separate edit
- **WHEN** Scribe suggested removing "in both 2024 and 2025" from "Yield fell above 3,800 m in
  both 2024 and 2025, mainly at Huancayo.", the user has since added "and Junín" after
  "Huancayo", and the user clicks "Accept and resolve"
- **THEN** the passage reads "Yield fell above 3,800 m, mainly at Huancayo and Junín." and the
  thread is resolved

### Requirement: Conflicting suggestions
When the user's edits and a suggestion change the same part of the passage, accepting SHALL NOT
apply the suggestion or resolve the thread: the suggestion SHALL say it conflicts with the
user's edits and keep "Try again" and Discard. The user's text SHALL never be overwritten by a
suggestion. A detached thread's suggestions SHALL offer only Discard.

#### Scenario: Overlapping edits
- **WHEN** the user has rewritten "in both 2024 and 2025" since Scribe suggested removing it,
  and clicks "Accept and resolve"
- **THEN** the passage keeps the user's text, the thread stays open, and the suggestion says it
  conflicts, with "Try again" and Discard

### Requirement: Asking again
"Try again" SHALL dismiss the pending suggestion and run the same Mini-Me again in the thread,
answering the comment that asked for the suggestion, with the passage as it is now.

#### Scenario: Asking Scribe again
- **WHEN** the user clicks "Try again" on Scribe's suggestion
- **THEN** the suggestion shows as dismissed, and a new reply from Scribe answers the same
  comment with the passage as it reads now

### Requirement: Resolving and deleting threads
Resolve SHALL dismiss the thread's pending suggestion and resolve it, which moves it to the
Resolved tab and hides its underline and badge; Reopen SHALL bring it back.
Deleting a thread SHALL ask once for confirmation and then remove the thread, its comments, its
replies and their suggestions; files its replies saved SHALL stay in the Project.

#### Scenario: Resolve and reopen
- **WHEN** the user clicks Resolve, picks the Resolved tab, opens the thread and clicks Reopen
- **THEN** the thread is listed under Open again with its passage underlined

#### Scenario: Delete
- **WHEN** the user deletes a thread and confirms
- **THEN** it is gone from the Comments sheet and from the Project's database, and the `.qmd` file is
  unchanged

### Requirement: Comment events
Comments and replies in a thread SHALL be messages with the same events as messages in a
Conversation (`message.created`, `message.delta`, `message.completed`, `message.failed`,
`message.cancelled`, `component.added`, `component.answered` and the others), in the thread's
own sequence. A suggestion SHALL be a `component.added` with kind `suggestion`, and its answer a
`component.answered` with payload `{ message_id, component_id, answer: { decision } }`, where
`decision` is `accepted`, `rejected` or `dismissed`. Creating, resolving, reopening and
deleting a thread, and moving its anchor, SHALL be stored in the Project's database without
events.

#### Scenario: Suggestion answered
- **WHEN** the user accepts a suggestion
- **THEN** the thread's events end with `component.answered` with `{ "decision": "accepted" }`
