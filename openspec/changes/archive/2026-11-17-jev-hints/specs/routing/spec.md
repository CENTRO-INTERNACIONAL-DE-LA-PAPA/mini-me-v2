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
  name and described by the description its model reads, plus `none`.

#### Scenario: Message without a mention
- **WHEN** the user sends "summarize #field-notes.txt" in a Conversation without tables or
  charts
- **THEN** one Jev request is sent with the `mini_me`, `reaction`, `needs_context` and `tools`
  questions

#### Scenario: Message with a mention
- **WHEN** the user sends "@Scribe summarize #field-notes.txt" in a Conversation without
  tables or charts
- **THEN** one Jev request is sent with only the `reaction`, `needs_context` and `tools`
  questions

#### Scenario: Untagged file in a Conversation with files
- **WHEN** the Conversation holds `field-trial.csv` and `field-trial-cleaned.csv` and the
  user sends "@Validator check the cleaned data"
- **THEN** one Jev request is sent with the `reaction`, `needs_context`, `file` and `tools`
  questions, the `file` options being the two Assets and `none`

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
- **THEN** Researcher's `mini_me` option names Researcher, "Finds papers", *Find Papers* and
  *Summarize*

#### Scenario: Component options
- **WHEN** Plotter drew "Yield by variety" from `field-trial.csv`, Curator then showed a table
  without a title from `field-trial-cleaned.csv`, and the user sends "make it a bar chart"
- **THEN** the Jev request has a `component` question whose options are the table, then the
  chart, each by its kind, title and source file, and `none`

#### Scenario: Tool options
- **WHEN** the user sends any message in a Conversation
- **THEN** the `tools` question offers read-a-file, read-a-component, save-a-file,
  show-a-table, write-a-document, suggest and `none`, and not hand-off

### Requirement: Routing request on the link
The core SHALL ask for a decision with `route.start`, payload
`{ route_id, state, mini_mes, files, components, ask }`:
- `route_id` is a new UUIDv7;
- `mini_mes` is `[{ id, name, description, traits }]`, `traits` being the names of the
  Mini-Me's Traits, each once, in the order of their first Step;
- `files` is `[{ id, name, components }]`, the options of the `file` question, newest first, and
  empty when `ask` does not hold `file`; `components` lists the tables and charts of the
  Conversation shown from that file, newest first, as `{ kind, title }`, and holds no rows or
  other component data;
- `components` is `[{ id, kind, title, file }]`, the options of the `component` question,
  newest first, `file` being the source file's name, and empty when `ask` does not hold
  `component`; it holds no rows or other component data;
- `ask` is the list of question IDs.

The sidecar SHALL answer with exactly one of:
- `route.done { route_id, answers, asked }`, where each answer is `{ choice, confidence,
  probabilities }`;
- `route.error { route_id, error: { code, message }, asked }`.

`asked` is the request sent to Jev, `{ state, questions }`, where `questions` maps each
question ID to `{ instructions, options }` and `options` maps each option to the text Jev
read for it; it is `null` in `route.error` when the request was not sent, such as when the
Typesafe key is missing.

#### Scenario: Decision
- **WHEN** the core sends `route.start` asking `reaction` and `needs_context`
- **THEN** the sidecar answers `route.done` with an answer for each of the two questions, and
  `asked` holding both questions with their instructions and options

#### Scenario: File question
- **WHEN** the core sends `route.start` asking `file` with two `files`
- **THEN** the `file` Choice offers each file's ID and `none`, and `route.done` holds an
  answer for `file`

#### Scenario: Component question
- **WHEN** the core sends `route.start` asking `component` with one chart in `components`
- **THEN** the `component` Choice offers the chart's ID and `none`, and `route.done` holds an
  answer for `component`

#### Scenario: No Typesafe key
- **WHEN** the core sends `route.start` and no Typesafe key is saved
- **THEN** the sidecar answers `route.error` with `asked` `null`

### Requirement: Routing a comment
A comment in a thread SHALL be routed as a message in a Conversation: one Jev request with the
`mini_me` question when it mentions no Mini-Me, and the `reaction` and `needs_context`
questions, but no `file`, `component` or `tools` question, since the thread's document is
already the reply's context. Below the threshold, or without Jev, Assistant SHALL answer.

#### Scenario: A comment without a mention
- **WHEN** the user comments "too long" in a thread
- **THEN** one Jev request is sent with the `mini_me`, `reaction` and `needs_context`
  questions, and the Mini-Me it picks above the threshold answers

## ADDED Requirements

### Requirement: Jev picks the component above the threshold
When Jev's `component` answer is one of the offered tables or charts with a confidence at or
above the confidence threshold, that component SHALL be the reply's picked component. A `none`
answer, a lower confidence, an unknown ID or no answer SHALL leave the reply without one. The
picked component SHALL be passed to the reply's run as `context.component`, `{ component_id }`,
or `null` without one, and from there to each of its Trait calls.

#### Scenario: Confident pick
- **WHEN** the threshold is 0.5 and Jev answers `component` with the chart "Yield by variety"
  at 0.8
- **THEN** the reply's `run.start` carries `context.component` with the chart's ID

#### Scenario: Unsure
- **WHEN** the threshold is 0.5 and Jev answers `component` with that chart at 0.3
- **THEN** the reply's `run.start` carries `context.component: null`

### Requirement: Jev's likely tools are passed on
The four tools with the highest probabilities in Jev's `tools` answer, leaving out `none`,
highest first, SHALL be passed to the reply's run as `context.tools`, a list of tool names,
and from there to each of its Trait calls, whatever their confidence. Without a `tools`
answer, `context.tools` SHALL be empty.

#### Scenario: Likely tools
- **WHEN** Jev's `tools` probabilities are show_table 0.4, none 0.2, save_file 0.15,
  read_file 0.1, read_component 0.08 and the rest lower
- **THEN** the reply's `run.start` carries `context.tools` `["show_table", "save_file",
  "read_file", "read_component"]`

#### Scenario: No decision
- **WHEN** Typesafe cannot be reached
- **THEN** the reply's `run.start` carries an empty `context.tools`
