# Spec Delta

## MODIFIED Requirements

### Requirement: The inspector edits a control Step
Selecting a control Step SHALL let the user edit:
- an approval's prompt, an "Ask for a written answer" switch, and, while that is on, an "AI
  model writes the questions" switch, which turning the first off also turns off;
- a condition's or loop's question;
- a loop's limit, from 1 to 10;
- the labels of a condition's or parallel split's branches, and add or remove a branch,
  keeping at least two.
Every Step SHALL offer Remove step.

#### Scenario: Third branch
- **WHEN** the user adds a branch to a parallel split
- **THEN** a third branch with an empty slot appears beside the others

#### Scenario: Removing a branch with Steps
- **WHEN** the user removes a branch holding two Steps
- **THEN** the inspector asks once more, naming the branch and its 2 Steps, before removing

#### Scenario: Two branches left
- **WHEN** a condition has two branches
- **THEN** neither can be removed

#### Scenario: Asking for a written answer
- **WHEN** the user selects an approval and turns on "Ask for a written answer", then "AI model
  writes the questions"
- **THEN** the approval is saved with `answer` `"text"` and `questions_by` `"model"`

#### Scenario: Turning off the written answer
- **WHEN** both switches are on and the user turns off "Ask for a written answer"
- **THEN** both are off, and the approval is saved without `answer` or `questions_by`
