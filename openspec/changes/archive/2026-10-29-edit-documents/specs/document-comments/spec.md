# Spec Delta

## ADDED Requirements

### Requirement: Threads opened from a Conversation
Each edit a Mini-Me sends with the edit-a-document tool SHALL open a comment thread on the
passage it quotes, stored and shown like any other thread. Its first message SHALL be the
Mini-Me's, holding the edit's reason as its text and the edit as a pending `suggestion` based on
the quoted text. The thread SHALL remember the Conversation it was opened from. The Mini-Me
SHALL NOT run in the thread until the user @-mentions it there.

#### Scenario: Two edits from a Conversation
- **WHEN** Scribe, asked in "Trial design" to tighten "#Trial report", sends two edits
- **THEN** "Trial report.qmd" has two new open threads, each starting with Scribe's reason and
  its pending suggestion, and the `.qmd` file is unchanged

#### Scenario: Asking again in such a thread
- **WHEN** the user comments "@Scribe keep the second sentence" in one of those threads
- **THEN** Scribe answers in the thread like in any other thread

## MODIFIED Requirements

### Requirement: The thread view
The thread view SHALL replace the list in the Comments sheet, with "All comments" to go back,
"N of M open" with buttons for the previous and next thread, the thread's number and where its
passage is ("Hypothesis, bullet 3"), who opened it and when with Resolve (Reopen once resolved)
and Delete, its comments and replies, and for an
open thread a one-line field to comment with the @ list of Mini-Mes. The field SHALL start
empty, so a comment is a note unless the user @-mentions a Mini-Me. A thread the user started
SHALL say "Opened by you"; a thread opened from a Conversation SHALL name the Mini-Me and the
Conversation ("Opened by Scribe · from Trial design"), and clicking the Conversation's name
SHALL open it. When that Conversation has been deleted, the thread SHALL name only the Mini-Me.

#### Scenario: Replying after Scribe
- **WHEN** Scribe has replied in a thread and the user sends "make it shorter still"
- **THEN** the comment is a note, and Scribe is asked only if the user @-mentions it

#### Scenario: Back to the Conversation
- **WHEN** the user opens a thread Scribe opened from "Trial design" and clicks "Trial design"
- **THEN** the Conversation "Trial design" is shown

### Requirement: Suggested edits
A Mini-Me answering a comment SHALL be able to suggest replacement text for the thread's
passage with the suggest-an-edit tool. While a suggestion waits, the source SHALL show the
passage struck through with the suggested text after it, underlined in the Mini-Me's colour, and
the Mini-Me's message in the thread view SHALL show it with "Accept and resolve" and Discard.
Once answered, its text SHALL look like any other text, and the thread's messages SHALL show it
with its decision. To get another version, the user SHALL @-mention the Mini-Me in the thread.

#### Scenario: A pending suggestion
- **WHEN** Scribe suggests "Yield fell above 3,800 m."
- **THEN** the source shows the passage struck through and "Yield fell above 3,800 m." after it in
  Scribe's colour, and Scribe's reply in the thread shows the suggestion with its two buttons

#### Scenario: Discarding
- **WHEN** the user clicks Discard
- **THEN** the source is unchanged, the marks disappear, and the suggestion shows as discarded

### Requirement: Conflicting suggestions
When the user's edits and a suggestion change the same part of the passage, accepting SHALL NOT
apply the suggestion or resolve the thread: the suggestion SHALL say it conflicts with the
user's edits, that the Mini-Me can be asked again in the thread, and keep Discard. The user's
text SHALL never be overwritten by a suggestion. A detached thread's suggestions SHALL offer
only Discard.

#### Scenario: Overlapping edits
- **WHEN** the user has rewritten "in both 2024 and 2025" since Scribe suggested removing it,
  and clicks "Accept and resolve"
- **THEN** the passage keeps the user's text, the thread stays open, and the suggestion says it
  conflicts and offers Discard

## REMOVED Requirements

### Requirement: Asking again
**Reason**: "Try again" is removed from suggestions. Asking the Mini-Me again in the thread with
an @-mention does the same, says what to change, and works the same for threads opened from a
Conversation, where there is no comment of the user's to answer again.
**Migration**: None; @-mention the Mini-Me in the thread to get another version.
