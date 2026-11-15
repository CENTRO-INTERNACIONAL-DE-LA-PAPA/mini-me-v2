## ADDED Requirements

### Requirement: Suggesting a change
The suggest tool (`suggest`, with a form for models) SHALL take a document's Asset ID, the
passage to replace (`find`) and the new text (`text`, empty to remove the passage). The core
SHALL add a waiting suggestion by the Mini-Me whose reply made the call, from a Conversation or a
comment thread, on any document of the Project, and the tool SHALL return its ID. The document's
file SHALL NOT change.

#### Scenario: From the chat
- **WHEN** Scribe, answering "make the methods in Trial report shorter", calls suggest on
  "Trial report.qmd" with a sentence that occurs once
- **THEN** a waiting suggestion by Scribe is added on that sentence, and the file is unchanged

#### Scenario: From a thread
- **WHEN** Scribe, answering "too long" in a thread, calls suggest on the thread's sentence
- **THEN** a waiting suggestion by Scribe is added on that sentence, as from the chat

### Requirement: Checks on a suggestion
The tool SHALL send the request `document.suggest`, params `{ asset_id, find, text }`, whose
result is `{ suggestion_id }`. The core SHALL refuse it, adding nothing, with `not_a_document`
unless the Asset is a `.qmd` document of the Project; with `passage_not_found` or
`passage_not_unique` unless `find` occurs exactly once in the saved document; and with
`invalid_input` when `find` is empty or `text` is larger than 64 KiB. The document SHALL be read
through the Project-folder confinement check.

#### Scenario: A quote that occurs twice
- **WHEN** a call suggests a change to "Huancayo", which occurs three times
- **THEN** the call fails with `passage_not_unique`, and nothing is added

#### Scenario: Not a document
- **WHEN** a call suggests a change to `field-trial.csv`
- **THEN** the call fails with `not_a_document`

### Requirement: Events of a suggestion
Adding a suggestion SHALL be stored in the Project's database without an event. A reply in a
Conversation that adds a suggestion SHALL get a `component.added` with the document's `document`
card, unless the reply already shows that document's card. A reply in a comment thread SHALL get
no card.

#### Scenario: Two suggestions from one reply
- **WHEN** Scribe's reply in "Trial design" suggests two changes to "Trial report.qmd"
- **THEN** the reply shows one "Trial report" card

## REMOVED Requirements

### Requirement: Suggesting an edit
**Reason**: Replaced by the suggest tool, which works from any reply.
**Migration**: Call `suggest` with the thread's passage as `find`.

### Requirement: Editing a document
**Reason**: Replaced by the suggest tool; an edit no longer opens a thread or adds a
`document-edits` card.
**Migration**: Call `suggest` once per passage.

### Requirement: Checks on a document edit
**Reason**: `document.edit` is replaced by `document.suggest`.
**Migration**: See "Checks on a suggestion".

### Requirement: Events of a document edit
**Reason**: Suggestions are stored without events, and no thread or `document-edits` card is
added.
**Migration**: See "Events of a suggestion".
