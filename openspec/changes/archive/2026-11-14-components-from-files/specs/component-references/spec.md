## REMOVED Requirements

### Requirement: Component names
**Reason**: Components are no longer referenced in messages, so they need no names.
**Migration**: Describe the table or chart in words; the model finds it among the
Conversation's components. The Outline shows a component's title or source file.

### Requirement: Repeated names
**Reason**: Component names are removed.
**Migration**: None.

### Requirement: Reference labels
**Reason**: `$` references are removed.
**Migration**: None.

### Requirement: Reference button
**Reason**: Components are referenced in words, not with chips.
**Migration**: Describe the table or chart in the message, or reference its file with `#`.

### Requirement: The $ list
**Reason**: `$` references are removed; a component's data lives in its source file.
**Migration**: Type `#` to reference the file, or describe the component in words.

### Requirement: The core checks a reference
**Reason**: There is no `component` Text Component left to check; the core no longer accepts
that kind.
**Migration**: None.

### Requirement: References in sent messages
**Reason**: `$` chips no longer exist; `#` chips are covered by the Text Component
requirements of messages.
**Migration**: None.
