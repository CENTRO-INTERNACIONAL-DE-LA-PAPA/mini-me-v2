# Spec Delta

## MODIFIED Requirements

### Requirement: Earlier files by name only
History entries SHALL name their files without their content. A file's content SHALL reach
a model only when a Trait reads it with the read-a-file tool, whether the file belongs to
the current message or an earlier one.

#### Scenario: Earlier file
- **WHEN** a file was referenced three messages ago and the user asks a follow-up without
  referencing it
- **THEN** the history names the file, and its content is not sent unless the model reads
  it
