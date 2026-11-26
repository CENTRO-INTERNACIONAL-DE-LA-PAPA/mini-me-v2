# Spec Delta

## MODIFIED Requirements

### Requirement: Components appear below a reply's text
The UI SHALL show a message's Interactive Components only once the Step that added each one has
finished, whatever the reply's status, so that text still arriving does not push them down.
Until the reply ends, each SHALL show with its Step in the Workflow progress. Once it has
ended, those without a `step_index` and those of the Steps whose `show_results` is set SHALL
show below its text and above its attachments, in order, and so SHALL those of the last Trait
Step run of a one-Step Workflow; every Step's components SHALL also stay with their Step. An approval
SHALL show below the text while the reply waits on it. Each component SHALL be drawn by its
kind's renderer for its version, with the app's theme tokens.

#### Scenario: Component while streaming
- **WHEN** a `component.added` event arrives for a streaming one-Step reply
- **THEN** the component does not show until the reply ends, and then shows under its text

#### Scenario: Waiting on an approval
- **WHEN** a Workflow reply pauses on an approval right after *Find Papers* added paper
  sources
- **THEN** the approval shows under the reply's text, and the paper sources show when the
  user opens *Find Papers* in the Workflow progress card

#### Scenario: Earlier Step's component after the run
- **WHEN** a Workflow's *Find Papers* Step adds paper sources, a later *Summarize* Step
  writes the reply's text, and the reply completes
- **THEN** the paper sources no longer show under the reply's text, and show when the user
  opens *Find Papers* in the reply's Workflow progress card

#### Scenario: Last Step's component stays
- **WHEN** a one-Step Workflow's Trait Step adds a chart and the reply completes
- **THEN** the chart shows under the reply's text

#### Scenario: Results shown in the reply
- **WHEN** an Exploratory Data Analysis run ends, its *Describe Variables* Step having
  `show_results` set
- **THEN** *Describe Variables*' tables and charts show under the summary, and also when the
  user selects *Describe Variables*

#### Scenario: Last Step without show_results
- **WHEN** a multi-Step Workflow's last Trait Step, without `show_results`, adds a chart
- **THEN** the chart shows only with its Step

#### Scenario: Earlier Step's component while running
- **WHEN** *Find Papers* has added paper sources and finished, and a later Step is still
  running
- **THEN** the paper sources show when the user opens *Find Papers* in the reply's Workflow
  progress card, and not under the reply's text
