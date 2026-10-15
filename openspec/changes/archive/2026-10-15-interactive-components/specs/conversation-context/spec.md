# Spec Delta

## MODIFIED Requirements

### Requirement: History entries
Each history entry SHALL be `{ author, name, content, files, complete }`:
- `author` is `user` or `mini_me`;
- `name` is "You", the Mini-Me's name, or "Mini-Me" when it is no longer known;
- `content` is the message text, followed by the `text` of each of its Interactive
  Components in order, separated by blank lines;
- `files` lists the names of its attached and referenced Assets;
- `complete` is `false` for a reply that was stopped, failed or is still streaming.

Notes from Mini-Me itself (author `system`) SHALL be left out.

#### Scenario: Stopped reply
- **WHEN** an earlier reply was stopped after "The main cause"
- **THEN** its entry has content "The main cause" and `complete: false`

#### Scenario: Routing note
- **WHEN** an earlier message got Mini-Me's note asking to mention a Mini-Me
- **THEN** the note is not in the history

#### Scenario: Reply with a component
- **WHEN** an earlier Researcher reply has the text "Found 12 papers." and a
  `paper-sources` component
- **THEN** its entry's content is "Found 12 papers." followed by the component's `text`, so
  a follow-up such as "summarize the third paper" can refer to it, and the component's text
  counts toward the history size budget
