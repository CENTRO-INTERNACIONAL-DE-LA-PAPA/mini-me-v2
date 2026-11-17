## MODIFIED Requirements

### Requirement: One Jev request per message
For each user message, the Rust core SHALL ask the sidecar for one routing decision before
the reply starts. The sidecar SHALL send one request to Typesafe's Jev (model `jev-latest`)
with the message as the state and these Choice questions:
- `mini_me`: only when the message mentions no Mini-Me; one option per Mini-Me, keyed by
  its ID and described by its name, its description and the names of its Traits;
- `reaction`: options `none`, `👍`, `🎉`, `💛`, `😄`, `😡`, `😢`, `🥔`, `🤔`, `😮`, `💪`,
  `🌱`, `😅`, `🙏`, `☕`, `🧪`, `🌧️`, each described by when it fits;
- `needs_context`: options `yes`, `no`;
- `file`: only when the message references and attaches no Asset and its Conversation has
  at least one; one option per Asset of the Conversation, keyed by its ID and described by
  its name and by the tables and charts of the Conversation shown from it, newest first, each
  by its kind and title, plus `none`;
- `component`: only when the Conversation has at least one table or chart; one option per
  table or chart, newest first, keyed by its ID and described by its kind, its title and its
  source file's name, plus `none`;
- `tools`: one option per tool with a form for models except hand-off, keyed by the tool's
  name and described by the description its model reads, plus `none`;
- `next_mini_me`: one option per Mini-Me, keyed and described as in `mini_me`, plus `none`,
  asking which Mini-Me should handle the part of the message the answering Mini-Me does not
  cover.

#### Scenario: Message without a mention
- **WHEN** the user sends "summarize #field-notes.txt" in a Conversation without tables or
  charts
- **THEN** one Jev request is sent with the `mini_me`, `reaction`, `needs_context`, `tools`
  and `next_mini_me` questions

#### Scenario: Message with a mention
- **WHEN** the user sends "@Scribe summarize #field-notes.txt" in a Conversation without
  tables or charts
- **THEN** one Jev request is sent with only the `reaction`, `needs_context`, `tools` and
  `next_mini_me` questions

#### Scenario: Untagged file in a Conversation with files
- **WHEN** the Conversation holds `field-trial.csv` and `field-trial-cleaned.csv` and the
  user sends "@Validator check the cleaned data"
- **THEN** one Jev request is sent with the `reaction`, `needs_context`, `file`, `tools` and
  `next_mini_me` questions, the `file` options being the two Assets and `none`

#### Scenario: Surprising result
- **WHEN** the user sends "wow, I didn't expect yield to drop that much"
- **THEN** the `reaction` question offers 😮, described as the user being surprised by a
  result

#### Scenario: Conversation without files
- **WHEN** the Conversation holds no Asset and the user sends "check the data"
- **THEN** the Jev request has no `file` question

#### Scenario: A file shown as a chart
- **WHEN** Plotter drew "Yield by variety" from `field-trial.csv` and the user sends
  "@Plotter make that chart a bar chart"
- **THEN** the `file` option for `field-trial.csv` reads "The file field-trial.csv. Used by
  components: chart 'Yield by variety'"

#### Scenario: A Mini-Me described by its Traits
- **WHEN** the library holds Researcher, described "Finds papers", whose Workflow runs
  *Find Papers* and then *Summarize*, and the user sends a message without a mention
- **THEN** Researcher's `mini_me` and `next_mini_me` options name Researcher, "Finds papers",
  *Find Papers* and *Summarize*

#### Scenario: Component options
- **WHEN** Plotter drew "Yield by variety" from `field-trial.csv`, Curator then showed a table
  without a title from `field-trial-cleaned.csv`, and the user sends "make it a bar chart"
- **THEN** the Jev request has a `component` question whose options are the table, then the
  chart, each by its kind, title and source file, and `none`

#### Scenario: Tool options
- **WHEN** the user sends any message in a Conversation
- **THEN** the `tools` question offers read-a-file, read-a-component, save-a-file,
  show-a-table, write-a-document, suggest and `none`, and not hand-off

### Requirement: Routing a comment
A comment in a thread SHALL be routed as a message in a Conversation: one Jev request with the
`mini_me` question when it mentions no Mini-Me, and the `reaction`, `needs_context` and
`next_mini_me` questions, but no `file`, `component` or `tools` question, since the thread's
document is already the reply's context. Below the threshold, or without Jev, Assistant SHALL
answer.

#### Scenario: A comment without a mention
- **WHEN** the user comments "too long" in a thread
- **THEN** one Jev request is sent with the `mini_me`, `reaction`, `needs_context` and
  `next_mini_me` questions, and the Mini-Me it picks above the threshold answers

### Requirement: The hand-off tool
A prompt-based Trait's model SHALL hand off with the hand-off tool, whose arguments are
`mini_me`, a Mini-Me's name; `request`, what to ask; and `file`, optionally the ID of one of
the Conversation's files. The prompt SHALL list the call's `mini_mes` by name, description and
the names of their Traits under "Mini-Mes you can hand off to". The sidecar SHALL send the
core `reply.hand_off { mini_me_id, request, asset_id }` with the call's `call_id`, and give the
model any refusal as the tool's result.

#### Scenario: Assistant hands off to Profiler
- **WHEN** Assistant's model, answering "what's in #field-trial.csv?", calls hand-off with
  `mini_me: "Profiler"`, `request: "profile this table"` and the file's ID
- **THEN** the sidecar sends `reply.hand_off` with Profiler's ID, the request and the file's
  ID

#### Scenario: Unknown name
- **WHEN** the model calls hand-off with `mini_me: "Theorizer"` and no Mini-Me has that name
- **THEN** nothing is sent to the core, and the tool's result names the Mini-Mes it can
  choose

#### Scenario: Mini-Mes by their Traits
- **WHEN** the library holds Researcher, whose Workflow runs *Find Papers* and then
  *Summarize*
- **THEN** Researcher's line under "Mini-Mes you can hand off to" names *Find Papers* and
  *Summarize*

### Requirement: The hand-off starts the other Mini-Me
After a reply with an accepted hand-off completes, the core SHALL route the hand-off as a message: one
Jev request whose state's `message` is the hand-off's request, with the `needs_context`,
`file` (only when the hand-off passes no file), `component`, `tools` and `next_mini_me`
questions in a Conversation, and the `needs_context` and `next_mini_me` questions in a thread,
never `mini_me` or `reaction`. The chosen Mini-Me's reply SHALL then start with the request as
input, the handed file, or else Jev's file pick, as `context.file`, and Jev's other picks as for
a message; `context.needs_context` SHALL be `true` without Jev's answer. A reply that failed or
was stopped SHALL start nothing.

#### Scenario: Profiler answers
- **WHEN** Assistant's reply with a hand-off to Profiler for `field-trial.csv` completes
- **THEN** one Jev request is sent with "profile this table" as the message and no `file`
  question, and Profiler's reply starts with the input "profile this table" and profiles
  `field-trial.csv`

#### Scenario: Without Jev
- **WHEN** no Typesafe key is saved and Assistant's reply with a hand-off to Profiler completes
- **THEN** Profiler's reply starts with `context.needs_context: true` and no other picks

#### Scenario: Stopped reply
- **WHEN** the user stops a reply after its model called hand-off
- **THEN** no other reply starts

#### Scenario: Mention in the text
- **WHEN** a reply's text says "you could ask @Plotter for a chart" and its model calls no
  tool
- **THEN** no other reply starts

### Requirement: The Mini-Me list is passed on
Every run SHALL carry `context.mini_mes`, `[{ id, name, description, traits }]`, every Mini-Me
of the library with the names of its Traits, passed to each of its Trait calls.

#### Scenario: Any reply
- **WHEN** a reply's run starts
- **THEN** its `run.start` carries every Mini-Me in `context.mini_mes`

## ADDED Requirements

### Requirement: Jev recommends a hand-off above the threshold
When Jev's `next_mini_me` answer is a Mini-Me of the library other than the reply's own, with a
confidence at or above the confidence threshold, that Mini-Me SHALL be the reply's recommended
hand-off. A `none` answer, the reply's own Mini-Me, a lower confidence or no answer SHALL leave
the reply without one. It SHALL be passed to the reply's run as `context.hand_off`,
`{ mini_me_id }`, or `null` without one.

#### Scenario: Confident recommendation
- **WHEN** the threshold is 0.5, the user sends "find papers on late blight and make a report",
  Jev picks Researcher for `mini_me` and Scribe for `next_mini_me` at 0.7
- **THEN** Researcher's `run.start` carries `context.hand_off` with Scribe's ID

#### Scenario: The answering Mini-Me
- **WHEN** Jev picks Researcher for both `mini_me` and `next_mini_me` above the threshold
- **THEN** Researcher's `run.start` carries `context.hand_off: null`

### Requirement: The model is told Jev's recommendation
When a call's `context.hand_off` names a Mini-Me, a prompt-based Trait's request SHALL tell the
model that Mini-Me should handle the part of the request it does not cover, and to hand off to
it with the hand-off tool. The model SHALL decide whether to hand off; without
`context.hand_off` the request SHALL say nothing about a recommended Mini-Me.

#### Scenario: Recommendation
- **WHEN** Assistant's call has `context.hand_off` with Plotter's ID
- **THEN** its first request names Plotter as the Mini-Me to hand off to with the hand-off tool

### Requirement: A call knows its Workflow's later Traits
Every prompt-based Trait call SHALL be told the names of the Traits its Mini-Me's Workflow can
still run after it, each once, counting every branch of a condition and every Step of a loop
it is in, and SHALL be told not to hand off work those Traits do. A call no Trait can follow
SHALL be told nothing about later Traits.

#### Scenario: A later Step
- **WHEN** Researcher's Workflow runs *Find Papers*, *Summarize* and *Make Report* and its
  *Summarize* call starts
- **THEN** that call's first request names *Make Report* as a Trait that runs after it

#### Scenario: The last Step
- **WHEN** Researcher's *Make Report* call starts
- **THEN** its first request names no later Traits

### Requirement: The core hands off for a Mini-Me without a model
When a reply completes with a recommended hand-off and without an accepted one, and none of its
Mini-Me's Workflow's Traits uses the prompt adapter, the core SHALL hand off as if the reply
had called the hand-off tool: to the recommended Mini-Me, with the reply's input as the
request and, as the file, the message's first referenced or attached file, or else the reply's
`context.file`. A Mini-Me with a prompt-based Trait SHALL hand off only through its model.

#### Scenario: Researcher hands off
- **WHEN** the user sends "find papers on late blight and write a report", Researcher, whose
  Workflow runs only *Find Papers*, answers with `context.hand_off` naming Scribe, and its
  reply completes
- **THEN** Researcher's reply shows a hand-off card to Scribe with that request, and Scribe
  answers next

#### Scenario: A model that does not hand off
- **WHEN** Assistant's reply has `context.hand_off` naming Plotter and its model calls no tool
- **THEN** no other reply starts

### Requirement: Each reply may hand off once
The core SHALL accept `reply.hand_off` once per reply, for a Mini-Me of the library other than
the reply's own, with a file of the Conversation or none, whether the reply answers a message in
a Conversation, a comment in a thread, or a Mini-Me's hand-off. It SHALL refuse any other with
`hand_off_not_allowed` and a message saying why.

#### Scenario: Second hand-off
- **WHEN** a reply already handed off to Profiler and its model calls hand-off again
- **THEN** the request fails with `hand_off_not_allowed`, and only the first hand-off stands

#### Scenario: Its own Mini-Me
- **WHEN** Assistant's model hands off to Assistant
- **THEN** the request fails with `hand_off_not_allowed`

#### Scenario: Chain
- **WHEN** Profiler, answering Assistant's hand-off, calls hand-off to Plotter
- **THEN** the hand-off is accepted, and Plotter answers after Profiler's reply completes

#### Scenario: Comment thread
- **WHEN** a Mini-Me answering a comment calls hand-off to Scribe
- **THEN** the hand-off is accepted, and Scribe answers next in the same thread

## REMOVED Requirements

### Requirement: The core accepts one hand-off per reply
**Reason**: It refused a hand-off from a reply a hand-off started; chains are now allowed.
**Migration**: Replaced by "Each reply may hand off once".
