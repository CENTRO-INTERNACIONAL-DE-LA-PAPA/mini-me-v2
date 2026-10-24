## MODIFIED Requirements

### Requirement: A Mini-Me is shown by name, avatar and colour
The UI SHALL get the list of Mini-Mes (ID, name, description, colours, avatar, group) from the
Rust core. It SHALL show each reply authored by a Mini-Me with that Mini-Me's name and its
avatar, whose body is in its `solid` colour and whose freckles are in its `ink`. Wherever the
UI names a Mini-Me inline (an `@` mention in the composer, a sent message or a reply, an entry
in the `@` list, a name in a reaction tooltip), it SHALL show the Mini-Me's pill: its avatar
and name on a rounded chip in its `tint` with `ink` text. A reply whose Mini-Me is unknown
SHALL show "Mini-Me" with a neutral avatar, and an inline name of an unknown Mini-Me SHALL show
a neutral pill.

#### Scenario: Reply header
- **WHEN** Scribe answers
- **THEN** the reply's header reads "Scribe" next to Scribe's avatar in Scribe's solid
  colour

#### Scenario: Unknown Mini-Me
- **WHEN** a Conversation holds a reply from a Mini-Me that no longer exists
- **THEN** the reply is shown as "Mini-Me" with a neutral avatar and its text intact

#### Scenario: Mention in a sent message
- **WHEN** the user sends a message mentioning @Skeptic
- **THEN** "@Skeptic" is shown as Skeptic's pill

#### Scenario: Mention in the composer
- **WHEN** the user picks Skeptic from the `@` list
- **THEN** the composer shows "@Skeptic" as Skeptic's pill, with Skeptic's avatar

#### Scenario: Mention of a Mini-Me that no longer exists
- **WHEN** a sent message mentions a Mini-Me that no longer exists
- **THEN** its mention is shown as a neutral pill with the text it had

#### Scenario: Reaction tooltip
- **WHEN** the user points at a reaction Skeptic added
- **THEN** a tooltip names Skeptic as its pill

### Requirement: Picking from the suggestion list with the keyboard
In the `@`, `#` and `$` suggestion lists, the up and down arrow keys SHALL move a highlight
through the entries, and Enter or Tab SHALL pick the highlighted entry. Escape SHALL close the
list. The first entry SHALL be highlighted until the user moves the highlight, and again
whenever the query changes.

#### Scenario: Picking with the keyboard
- **WHEN** the user types "@" and presses the down arrow, then Enter
- **THEN** the second entry is inserted as a mention

#### Scenario: No match
- **WHEN** the user types "@zzz"
- **THEN** no list is shown, and Enter sends the message as usual

### Requirement: Picked references are pills in the composer
After the user picks a Mini-Me, a file or a table or chart in the composer, or adds a table
or chart with its reference button, the composer SHALL show that reference inline as it is
shown in a sent message: a Mini-Me's pill, a file chip, or a table or chart chip with its
icon. Typing, selecting, undo, paste and input methods SHALL work as in a plain text box, and
the caret SHALL stay where the text it follows is drawn, however many references the text
holds.

#### Scenario: Picked mention
- **WHEN** the user types "@Sk" and picks Skeptic
- **THEN** "@Skeptic" is shown as Skeptic's pill in the composer before sending

#### Scenario: Caret after several references
- **WHEN** the composer holds an `@` mention, a `#` file and a long `$` reference, and the
  user types after them
- **THEN** the caret is drawn right after the last character typed

### Requirement: Picked references act as one block
In the composer, a picked reference SHALL act as one block: the caret SHALL step over it, a
selection SHALL hold all of it or none of it, and Backspace or Delete next to it SHALL remove
all of it. The message SHALL be sent with the reference's label as its text, and copying or
cutting text with references SHALL put the text as it would be sent on the clipboard. A new
line typed with Shift+Enter SHALL be sent as a line break.

#### Scenario: Stepping over a picked mention
- **WHEN** the caret is right after a picked "@Skeptic" and the user presses the left arrow
- **THEN** the caret moves to just before "@"

#### Scenario: Deleting a picked mention
- **WHEN** the caret is right after a picked "@Skeptic" and the user presses Backspace
- **THEN** the whole mention is removed

#### Scenario: Sent text
- **WHEN** the user sends "Ask " followed by a picked "@Skeptic" and " about this"
- **THEN** the message's content is "Ask @Skeptic about this" and its `mini_me` Text
  Component covers "@Skeptic"
