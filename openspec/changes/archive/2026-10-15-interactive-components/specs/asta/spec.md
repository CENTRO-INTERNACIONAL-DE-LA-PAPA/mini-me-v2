# Spec Delta

## MODIFIED Requirements

### Requirement: Find Papers adapter
The sidecar's `asta-paper-finder` adapter SHALL declare provider `ai2`. It SHALL send the
call's input text to Asta's Paper Finder, write one line saying how many papers it found
(or Paper Finder's own summary when there is one), and add a `paper-sources` component
holding up to 50 papers in relevance order, each with title, authors, year, venue when
known, a link, and why it is relevant. If the component is rejected, the reply SHALL list
the papers as text instead: at most 20, saying how many more there were.

#### Scenario: Search
- **WHEN** the user sends "@Researcher late blight resistance genes in wild potato"
- **THEN** Researcher replies with a line saying how many papers it found and source cards
  below it, each with its title, authors, year, link and relevance

#### Scenario: Nothing found
- **WHEN** Paper Finder returns no papers
- **THEN** the reply says no papers were found and suggests rephrasing, and has no
  component

#### Scenario: Component rejected
- **WHEN** the core rejects the `paper-sources` component
- **THEN** the reply holds the papers as a numbered text list

### Requirement: Theorize adapter
The sidecar's `asta-theorizer` adapter SHALL declare provider `ai2`. It SHALL send the
call's input text to Asta's Theorizer and report each of its steps as progress. When it
finishes, the adapter SHALL write one line saying how many theories it formed and add a
`theories` component with each theory's wording, statements, evidence and cited papers. It
SHALL attach the Theorizer's full result as the Asset `theory-store.json`. If the component
is rejected, the theories SHALL be written as text instead. If the Asset can't be written,
the reply SHALL still complete.

#### Scenario: Theories
- **WHEN** the user sends "@Theorist why do some potato varieties tolerate drought better?"
- **THEN** the reply shows the Theorizer's steps as progress while it works, and ends with
  a line counting the theories, the theories component and the attachment
  `theory-store.json`

#### Scenario: Component rejected
- **WHEN** the core rejects the `theories` component
- **THEN** the reply holds each theory in plain language with its evidence and numbered
  references as text, and still attaches `theory-store.json`
