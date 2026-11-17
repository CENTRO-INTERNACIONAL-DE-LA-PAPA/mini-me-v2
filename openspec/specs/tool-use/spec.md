# tool-use Specification

## Purpose
Defines how prompt-based Traits use tools: what they know of the Conversation's files and
components, which tools their AI model is offered, and how the model calls tools, sees their
results and continues before writing its answer.

## Requirements

### Requirement: Prompt Traits know the Conversation's results
Every call of a prompt-based Trait SHALL tell the model the name and ID of each Asset and
the kind, author and ID of each Interactive Component of the Conversation, newest first, at
most 50 of each, marking the current message's files, the
reply's picked file, which it SHALL describe as the file the user probably means, and the
reply's picked component, which it SHALL describe as the component the user probably means. It
SHALL NOT include their content; the model reads content with the read tools.

#### Scenario: Referenced file
- **WHEN** the user sends "@Scribe summarize #notes.txt"
- **THEN** the first request names `notes.txt` and its ID as a file of the message, without
  its content, and the model reads it before summarizing

#### Scenario: Picked file
- **WHEN** the user sends "@Scribe summarize the field notes" and Jev picks
  `field-notes.txt`
- **THEN** the first request lists `field-notes.txt` marked as the file the user probably
  means, without its content

#### Scenario: Earlier table
- **WHEN** the user sends "@Assistant what is in the third row of the last table?" without
  a reference
- **THEN** the first request lists the newest `table` component with its ID, and the model
  reads it, then its source file, and answers from its rows

#### Scenario: Referenced chart
- **WHEN** the user sends "@Scribe explain the yield by variety chart"
- **THEN** the first request lists the chart component with its ID, without its data, and the
  model reads the chart with read-a-component before explaining

#### Scenario: Picked component
- **WHEN** the user sends "@Plotter make that chart a bar chart" and Jev picks the chart
  "Yield by variety"
- **THEN** the first request lists that chart marked as the component the user probably
  means, without its data

### Requirement: Tools offered to the model
A prompt-based Trait's model SHALL be offered, on every call, every tool that has a form for
models: read-a-file, read-a-component, hand-off, save-a-file, show-a-table, write-a-document and
suggest. The tools offered SHALL NOT depend on the Trait, nor on whether the call answers a
comment thread.

#### Scenario: Assistant's tools
- **WHEN** Assistant answers in a Conversation
- **THEN** its model is offered read-a-file, read-a-component, hand-off, save-a-file,
  show-a-table, write-a-document and suggest

#### Scenario: Assistant in a comment thread
- **WHEN** Assistant answers "@Assistant is this clear?" in a comment thread
- **THEN** its model is offered the same tools

#### Scenario: Scout's tools
- **WHEN** Explorer answers with *Scout*
- **THEN** its model is offered the same tools as Assistant's

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
### Requirement: Likely tools in the request
When a call's `context.tools` is not empty, a prompt-based Trait's model request SHALL name
those tools as likely useful, in their order. The model SHALL still be offered every tool, and
an empty `context.tools` SHALL add nothing to the request.

#### Scenario: Hint
- **WHEN** a call's `context.tools` is `["show_table", "save_file"]`
- **THEN** its first request says show_table and save_file are likely useful, and the model is
  offered every tool

#### Scenario: No hint
- **WHEN** a call's `context.tools` is empty
- **THEN** its first request names no likely tools
