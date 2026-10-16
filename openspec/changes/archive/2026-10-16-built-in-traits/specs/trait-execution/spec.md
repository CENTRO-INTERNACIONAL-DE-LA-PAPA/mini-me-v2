# Spec Delta

## MODIFIED Requirements

### Requirement: Echo adapter
The sidecar SHALL provide the `echo` adapter, used by tests and development: its input is
`{ text }` and it streams that text back one word at a time, keeping the original
whitespace, then ends with `call.done`. It declares no providers and ignores `trait` and
`model`. In the built-in library only placeholder Traits use it.

#### Scenario: Echo output
- **WHEN** the `echo` adapter runs with the text "What causes late blight?"
- **THEN** its deltas concatenate to "What causes late blight?" and the call ends with
  `call.done`

## ADDED Requirements

### Requirement: Scout Trait
The Trait library SHALL contain *Scout*, run by the `prompt` adapter, with instructions
asking for a varied set of directions worth exploring on the topic of the message and the
text Assets it references, each with a line on why it may be worth pursuing. The directions
are leads to look into, not hypotheses or conclusions. Its input is `{ text }`, as for
*Summarize*.

#### Scenario: Directions on a topic
- **WHEN** the user sends "@Explorer late blight resistance in native potato varieties"
- **THEN** Explorer's reply lists several distinct directions to explore, each with a
  short reason, and states none of them as a finding

### Requirement: Refute Trait
The Trait library SHALL contain *Refute*, run by the `prompt` adapter, with instructions
asking it to argue that the statement in the message is wrong, using only the message, the
text Assets it references, and widely established knowledge. It names the weakest points
of the statement and the evidence that would settle them. It does not invent sources or
results; when it finds no strong counter-argument, it says so. Its input is `{ text }`.

#### Scenario: Challenging a claim
- **WHEN** the user sends "@Skeptic fungicide rotation alone prevents late blight
  resistance"
- **THEN** Skeptic's reply argues against the claim, naming its weakest points and what
  evidence would settle them

#### Scenario: Nothing to argue against
- **WHEN** the message holds no statement or claim
- **THEN** the reply says in one sentence that it needs a statement to argue against

### Requirement: Plan Trait
The Trait library SHALL contain *Plan*, run by the `prompt` adapter, with instructions
asking for a plan for the project or goal in the message: an ordered list of steps, or an
architecture of parts and how they connect when the goal is a system. Each step says what
it produces. It uses referenced text Assets and states the assumptions it makes. Its input
is `{ text }`.

#### Scenario: Planning a study
- **WHEN** the user sends "@Planner a two-season field trial of three blight-resistant
  varieties"
- **THEN** Planner's reply is an ordered list of steps, each saying what it produces, with
  the assumptions it made

### Requirement: Wonder Trait
The Trait library SHALL contain *Wonder*, run by the `prompt` adapter, with instructions
asking for open questions that take the topic of the message, and the text Assets it
references, further. The questions are varied (mechanism, context, method, consequence),
each specific enough to research, and they are not answered. Its input is `{ text }`.

#### Scenario: Questions on a topic
- **WHEN** the user sends "@Inquirer how temperature affects Phytophthora infestans
  sporulation"
- **THEN** Inquirer's reply is a list of specific open questions on the topic, without
  answers

### Requirement: Experiment Trait
The Trait library SHALL contain *Experiment*, run by the `prompt` adapter, with
instructions asking for the design of an experiment that tests the hypothesis in the
message: the variables and how they are measured, the treatments and controls, the
experimental design and replication, the data to collect, how it will be analysed, and the
result that would support or reject the hypothesis. When the message holds no testable
hypothesis, it proposes one and says so. Its input is `{ text }`.

#### Scenario: Designing an experiment
- **WHEN** the user sends "@Experimenter early planting reduces late blight severity"
- **THEN** Experimenter's reply describes the variables, treatments and controls, design,
  data, analysis and the result that would support or reject the hypothesis

#### Scenario: No hypothesis given
- **WHEN** the user sends "@Experimenter late blight and irrigation"
- **THEN** the reply proposes a testable hypothesis, says it did so, and designs an
  experiment for it
