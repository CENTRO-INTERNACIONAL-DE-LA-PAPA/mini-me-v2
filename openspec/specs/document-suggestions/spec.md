# document-suggestions Specification

## Purpose
Suggestions on the passages of a document: proposed replacements that Mini-Mes make and the user
accepts or discards in the document's source, whatever the reply that made them.

## Requirements

### Requirement: A suggestion belongs to its document
A suggestion SHALL be stored in the Project's database with its document, its passage (start,
end and the passage's text when it was made), the suggested text, its author (the Mini-Me whose
reply made it) and its state: waiting, accepted, discarded or replaced. It SHALL NOT record the
Conversation, thread or message it was made from. The document's file SHALL change only when the
user accepts a suggestion.

#### Scenario: Suggested from the chat
- **WHEN** Scribe, asked in "Trial design" to shorten a paragraph of "Trial report.qmd", calls
  the suggest tool
- **THEN** the Project holds a waiting suggestion on that paragraph by Scribe, no thread is
  opened, and the `.qmd` file is unchanged

### Requirement: Suggestions are shown in the source
The document view SHALL show each waiting suggestion in the source: its passage struck through
and the suggested text right after it, underlined in its author's colour. Suggestions SHALL be
read when the document opens and again when a reply in one of its threads ends. Answered and
replaced suggestions SHALL NOT be shown.

#### Scenario: A waiting suggestion
- **WHEN** the user opens "Trial report.qmd" with Scribe's suggestion "Yield fell above
  3,800 m." on a sentence
- **THEN** the sentence is struck through and "Yield fell above 3,800 m." follows it in Scribe's
  colour

### Requirement: Answering a suggestion in the source
Clicking a waiting suggestion in the source SHALL show Accept and Discard beside it. Accept SHALL
save the document with the suggestion applied and mark it accepted. Discard SHALL mark it
discarded and leave the document unchanged. Either SHALL remove its marks from the source.

#### Scenario: Discarding
- **WHEN** the user clicks the suggestion and then Discard
- **THEN** the source is unchanged, the marks disappear, and the suggestion is discarded

### Requirement: Accepting merges with the user's edits
A suggestion SHALL keep the passage text it was based on. When the passage still reads that
text, accepting SHALL replace it with the suggested text. When the user has edited the passage
since, accepting SHALL combine the Mini-Me's change with the user's edits when they change
different parts of the passage.

#### Scenario: Accepting after a separate edit
- **WHEN** Scribe suggested removing "in both 2024 and 2025" from "Yield fell above 3,800 m in
  both 2024 and 2025, mainly at Huancayo.", the user has since added "and Junín" after
  "Huancayo", and the user accepts
- **THEN** the passage reads "Yield fell above 3,800 m, mainly at Huancayo and Junín."

### Requirement: A conflicting suggestion keeps waiting
When the user's edits and a suggestion change the same part of the passage, accepting SHALL
change nothing, say the suggestion conflicts with the user's edits, and keep it waiting with
Discard. The user's text SHALL never be overwritten by a suggestion.

#### Scenario: Overlapping edits
- **WHEN** the user has rewritten "in both 2024 and 2025" since Scribe suggested removing it,
  and accepts
- **THEN** the passage keeps the user's text, and the suggestion says it conflicts and offers
  Discard

### Requirement: A suggestion's passage follows the source
A suggestion's passage SHALL move with the source as the user edits it in Mini-Me, and SHALL be
saved with the document, as a comment thread's anchor is. When a document opens and a
suggestion's passage is not where it was, the suggestion SHALL be placed on the passage's text
if it is found once; otherwise it SHALL be detached and offer only Discard.

#### Scenario: Passage removed outside Mini-Me
- **WHEN** a suggestion's passage is deleted from the `.qmd` in another editor and the document
  is opened in Mini-Me
- **THEN** the suggestion is shown as detached, offering only Discard

### Requirement: A newer suggestion replaces the one it overlaps
When a new suggestion's passage overlaps the passage of a waiting suggestion of the same
document, the older one SHALL be marked replaced and no longer shown, whoever made either.

#### Scenario: Asking again
- **WHEN** Scribe's suggestion waits on a sentence, the user comments "keep 'both seasons'", and
  Scribe suggests again for that sentence
- **THEN** only Scribe's new suggestion is shown, and the first is replaced
