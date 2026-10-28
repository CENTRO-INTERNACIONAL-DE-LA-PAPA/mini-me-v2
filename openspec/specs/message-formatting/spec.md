# message-formatting Specification

## Purpose
Defines how the text of a Mini-Me's reply and of an opened Step output is formatted: which
Markdown renders, what is shown as text instead, how links open and how Text Components
stay chips.

## Requirements

### Requirement: Replies render Markdown
The UI SHALL render the content of a message authored by a Mini-Me, and the output of a Trait
Step opened in a Workflow's progress card, as GitHub-flavoured Markdown: bold, italics,
strikethrough, headings, ordered and unordered lists, task lists, block quotes, inline code,
code blocks, links, horizontal rules and tables. A single line break SHALL show as a line
break. The user's own messages and system messages SHALL stay plain text.

#### Scenario: Bold and lists
- **WHEN** a Mini-Me replies "**Claim:** the sky is blue\n\n- first\n- second"
- **THEN** "Claim:" is bold and "first" and "second" are shown as a bulleted list, without
  the `**` and `-` markers

#### Scenario: Table
- **WHEN** a reply holds a Markdown table
- **THEN** it is shown as a table with a header row, on a bordered card

#### Scenario: Line break
- **WHEN** a reply holds "Yield\nper plot" on two lines
- **THEN** "per plot" is shown on its own line

#### Scenario: Opened Step output
- **WHEN** the user opens a done Trait Step in Investigator's progress card and its output
  holds a numbered list
- **THEN** the output is shown as a numbered list

#### Scenario: User message stays plain
- **WHEN** the user sends "**draft** notes"
- **THEN** the sent message shows "**draft** notes" as typed

### Requirement: HTML and images are not rendered
Raw HTML in a reply SHALL be shown as text and never rendered. A Markdown image SHALL be shown
as a link with its alt text, and the image SHALL NOT be loaded, so a reply never makes the
app fetch anything.

#### Scenario: HTML in a reply
- **WHEN** a reply holds `<b>hi</b><script>alert(1)</script>`
- **THEN** that text is shown as typed, and nothing runs

#### Scenario: Image in a reply
- **WHEN** a reply holds `![field](https://example.org/plot.png)`
- **THEN** a link reading "field" is shown and no request is made for the image

### Requirement: Links open in the browser
A link in a reply SHALL open in the user's default browser, never inside the app window. Only
`http`, `https` and `mailto` links SHALL be active; any other link SHALL be shown as its text.

#### Scenario: Web link
- **WHEN** the user clicks a link to `https://cipotato.org` in a reply
- **THEN** it opens in the default browser and the app stays on the Conversation

#### Scenario: Unsafe link
- **WHEN** a reply holds `[click](javascript:alert(1))`
- **THEN** "click" is shown as plain text

### Requirement: Text Components stay chips in Markdown
A reply's Text Components SHALL keep showing as chips at their positions while the rest of the
text is formatted: a `mini_me` Text Component as the Mini-Me's pill, an `asset` one as a file
chip that opens the file.

#### Scenario: Mention inside a list
- **WHEN** a reply holds a list item "ask @Skeptic next" whose "@Skeptic" is a `mini_me` Text
  Component
- **THEN** the item is shown in a list with "@Skeptic" as Skeptic's pill

### Requirement: Streaming text is formatted as it arrives
While a reply streams, the text received so far SHALL be formatted as Markdown. A marker
whose closing half has not arrived yet SHALL be shown as typed until it does. A finished reply
SHALL NOT be formatted again unless its content changes.

#### Scenario: Unfinished bold
- **WHEN** a streaming reply has received "the **main"
- **THEN** it shows "the **main" as typed, and "main" turns bold once the closing `**`
  arrives
