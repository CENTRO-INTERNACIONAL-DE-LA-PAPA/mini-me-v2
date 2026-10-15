# Spec Delta

## Purpose

Defines Interactive Components: the hand-coded kinds and their versions, which Traits may
use them, how a Trait adds one to a reply, how components are stored and replayed, and how
the UI shows them below a reply's text.

## ADDED Requirements

### Requirement: Kinds of Interactive Components
Each Interactive Component kind SHALL be hand-coded in the UI, with a kebab-case `kind` name
and a renderer for each of its versions (positive integers). Component data SHALL come only
from the adapters of built-in Traits that list the kind. Adding a kind SHALL NOT need a
change to the event protocol, the link protocol or the Project database.

#### Scenario: Kinds in this version
- **WHEN** the app starts
- **THEN** the UI renders `paper-sources` version 1 and `theories` version 1

#### Scenario: Every listed kind is rendered
- **WHEN** the app is built
- **THEN** every kind a built-in Trait lists has a renderer for version 1

### Requirement: Adding a component to a reply
During a call, the sidecar SHALL be able to send `core.request` with method `component.add`
and params `{ kind, version, data, text }`. `data` is a JSON value, and `text` is a
non-empty plain-text alternative. If the reply is still streaming, the core SHALL give the
component a new UUIDv7, persist it, and answer `{ component_id }`.

#### Scenario: Paper list added
- **WHEN** a Find Papers call adds a valid `paper-sources` component
- **THEN** the core answers with a new `component_id`, and the reply shows the component
  below its text

#### Scenario: After the reply ended
- **WHEN** the sidecar sends `component.add` for a call that has ended
- **THEN** the core answers with error code `call_not_active`, and nothing is persisted

### Requirement: Only listed kinds are accepted
The core SHALL reject `component.add` with:
- `component_not_allowed` when the call's Trait does not list the kind;
- `invalid_component` when `text` is empty or `data` serialized is larger than 2 MiB.

A rejected component SHALL NOT be persisted, and the call SHALL continue.

#### Scenario: Kind the Trait doesn't list
- **WHEN** a Find Papers call adds a `theories` component
- **THEN** the request fails with `component_not_allowed`, and the reply keeps streaming

#### Scenario: Empty text
- **WHEN** a Find Papers call adds `paper-sources` with an empty `text`
- **THEN** the request fails with `invalid_component`, and nothing is persisted

### Requirement: Component event
A component SHALL be persisted as the event `component.added`, payload `{ message_id,
component: { id, kind, version, data, text } }`. It SHALL apply only to a streaming reply,
and a message's components SHALL keep the order of their events.

#### Scenario: Replay
- **WHEN** a Conversation is replayed from sequence 1
- **THEN** each reply shows the same components, in the same order, as before

### Requirement: Components appear below a reply's text
The UI SHALL show a message's Interactive Components below its text and above its
attachments, in order, while the reply streams and after it ends. Each component SHALL be
drawn by its kind's renderer for its version, with the app's theme tokens.

#### Scenario: Component while streaming
- **WHEN** a `component.added` event arrives for a streaming reply
- **THEN** the component appears under the text received so far, and the progress line
  stays below it until the reply ends

### Requirement: Unknown kinds fall back to text
When the UI has no renderer for a component's kind and version, or its renderer fails, it
SHALL show the component's `text` instead, and SHALL keep showing the rest of the message.

#### Scenario: Project from a newer version
- **WHEN** a Conversation holds a component whose kind this version of the app doesn't know
- **THEN** that component's place shows its `text`, and the reply's other content is
  unchanged

#### Scenario: Data the renderer can't draw
- **WHEN** a component's data is missing a field its renderer needs and the renderer fails
- **THEN** that component's place shows its `text`

### Requirement: Paper sources component
The data of `paper-sources` version 1 SHALL be `{ papers }`. Each paper has `title`, and optionally
`authors` (names), `year`, `venue`, `url` and `reason`. The UI SHALL show the first five
papers as cards with title, first authors, year and reason. If there are more papers, a
"Show all sources" button SHALL reveal the rest. A card with a `url` SHALL open it in the
default browser when clicked.

#### Scenario: Opening a source
- **WHEN** the user clicks a paper's card
- **THEN** the paper's `url` opens in the system's default browser

#### Scenario: Many sources
- **WHEN** the component holds 18 papers
- **THEN** five cards are shown with "Show all sources", and clicking it shows all 18

#### Scenario: Link that is not a web address
- **WHEN** a paper's `url` does not start with `http://` or `https://`
- **THEN** its card is shown without a link and nothing is opened

### Requirement: Theories component
The data of `theories` version 1 SHALL be `{ theories, references }`. Each theory has a `name`, an
optional `description` and `statements`. Each statement has its `text` and `evidence`
items, each with `text` and `refs`. Names, descriptions and statement texts are each
`{ plain, technical }`. A `ref` is the 1-based number of an entry in `references`, which
holds `title`, `year` and `url`.

#### Scenario: Evidence cites a paper
- **WHEN** an evidence item has `refs` [2]
- **THEN** it shows "[2]", which points to the second reference listed under the theories

### Requirement: Switching a theory's wording
The UI SHALL show each theory in plain language first. A control on each theory SHALL
switch its name, description and statements between plain and technical wording. A theory
whose `technical` text is missing SHALL show its plain text in both.

#### Scenario: Technical wording
- **WHEN** the user switches the second theory to technical wording
- **THEN** only that theory shows its technical name, description and statements
