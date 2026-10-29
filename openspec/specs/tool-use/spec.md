# tool-use Specification

## Purpose
Defines how prompt-based Traits use tools: what they know of the Conversation's files and
components, which tools their AI model is offered, and how the model calls tools, sees their
results and continues before writing its answer.

## Requirements

### Requirement: Prompt Traits know the Conversation's results
Every call of a prompt-based Trait SHALL tell the model the name and ID of each Asset and
the kind, author and ID of each Interactive Component of the Conversation, newest first, at
most 50 of each, marking the current message's files. It SHALL also tell the model each `$`
reference of the current message: its label, its component's kind and its component's ID.
It SHALL NOT include their content; the model reads content with the read tools.

#### Scenario: Referenced file
- **WHEN** the user sends "@Scribe summarize #notes.txt"
- **THEN** the first request names `notes.txt` and its ID as a file of the message, without
  its content, and the model reads it before summarizing

#### Scenario: Earlier table
- **WHEN** the user sends "@Assistant what is in the third row of the last table?" without
  a reference
- **THEN** the first request lists the newest `table` component with its ID, and the model
  reads it and answers from its rows

#### Scenario: Referenced chart
- **WHEN** the user sends "@Scribe explain $Yield-by-variety"
- **THEN** the first request names that reference as a chart with its component's ID,
  without its data, and the model reads the chart with read-a-component before explaining

### Requirement: Tools offered to the model
A prompt-based Trait's model SHALL be offered read-a-file and read-a-component on every
call, plus the tools its Trait definition lists. A prompt-based Trait SHALL list only tools
that have a form for models: save-a-file, show-a-table, write-a-document, suggest-an-edit and
edit-a-document. Suggest-an-edit SHALL be offered only to a call answering a comment thread, and
edit-a-document only to a call outside one.

#### Scenario: Assistant's tools
- **WHEN** Assistant answers in a Conversation
- **THEN** its model is offered read-a-file, read-a-component, save-a-file, show-a-table,
  write-a-document and edit-a-document

#### Scenario: Assistant in a comment thread
- **WHEN** Assistant answers "@Assistant is this clear?" in a comment thread
- **THEN** its model is also offered suggest-an-edit, and not edit-a-document

#### Scenario: Scout's tools
- **WHEN** Explorer answers with *Scout*, which lists no tools
- **THEN** its model is offered only read-a-file and read-a-component

### Requirement: Answering in tool rounds
In each round the model either asks for one or more tool calls, which run in the order
given and whose results it gets before the next round, or writes its final answer. Text the
model writes in any round SHALL stream into the reply when its Step streams.

#### Scenario: Create and show a sample file
- **WHEN** the user sends "Create a sample CSV of potato yields by variety and show it" and
  routing picks Assistant
- **THEN** the reply has a saved CSV Asset attached, a `table` component with its rows, and
  text describing what was made

#### Scenario: Plain question
- **WHEN** the user sends "@Assistant what is late blight?"
- **THEN** Assistant answers with text, without calling a tool

### Requirement: Limit on tool rounds
A call SHALL have at most 8 rounds with tool calls. After the eighth, the model SHALL be
told to answer without calling tools; its text SHALL end the call, and any tool call it
still asks for SHALL be ignored.

#### Scenario: Model keeps calling tools
- **WHEN** the model still asks for tools in the eighth round
- **THEN** the next request tells it to answer now, and its text ends the call without
  running further tools

### Requirement: Tool failures go back to the model
When a tool fails, its message SHALL be returned to the model as that call's result, and
the call SHALL continue, so the model can correct the call or explain the problem.

#### Scenario: Too many rows
- **WHEN** the model asks to show a table of 800 rows it wrote
- **THEN** the model gets the tool's message that the limit is 500 rows and can try again

#### Scenario: Unreadable referenced file
- **WHEN** the user asks Scribe to summarize a referenced PDF
- **THEN** read-a-file fails as unreadable, and the reply says the file could not be read

### Requirement: Models without tool calling
When the chosen model does not support tool calling, a prompt-based Trait's call SHALL fail
with code `tools_unsupported` and a message naming the model and saying to choose another
in Settings.

#### Scenario: Model without tools
- **WHEN** the model chosen in Settings rejects requests that offer tools
- **THEN** the reply fails with `tools_unsupported`, naming the model

### Requirement: Tool use stops when the reply is stopped
A call SHALL check for cancellation before each round and each tool call, and SHALL start
no further round or tool once the reply is stopped.

#### Scenario: Stopped mid-way
- **WHEN** the user stops the reply while the model is in its second round
- **THEN** no further tool is called, and no later file is saved
