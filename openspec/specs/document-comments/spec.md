# document-comments Specification

## Purpose
Defines comment threads on the passages of a document: how a comment is answered by a Mini-Me
the way a chat message is, how threads are resolved and deleted, and the comments panel of the
document view.

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
Overview's counts, outputs or summary material, or Files' "Used in" column.

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
passage is ("Hypothesis, bullet 3") with a "…" menu beside them holding Resolve (Reopen once
resolved) and Delete, its comments and replies, and for an open thread a one-line field to
comment with the @ list of Mini-Mes. The field SHALL start empty; every comment gets a reply.

#### Scenario: Replying after Scribe
- **WHEN** Scribe has replied in a thread and the user sends "make it shorter still"
- **THEN** a Mini-Me answers the comment in the thread, picked as for any comment without an
  @-mention

### Requirement: Passages and number badges in the source
An open thread's passage SHALL show a faint underline and, right after it, a badge with the
thread's number. Clicking the badge or the passage SHALL show the Comments sheet with the thread
view of that thread, which highlights its passage.

#### Scenario: From the source to the thread
- **WHEN** the user clicks the badge showing 2 after "above 3,800 m"
- **THEN** the Comments sheet shows the thread view of the thread on it

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
