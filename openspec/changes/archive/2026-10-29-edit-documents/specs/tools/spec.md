# Spec Delta

## ADDED Requirements

### Requirement: Editing a document
The edit-a-document tool (`edit_document`, with a form for models) SHALL take a document's Asset
ID and a list of edits, each with the exact text it replaces (`find`), the new text (`replace`,
at most 64 KiB) and a short `reason`. It SHALL open one comment thread per edit, as the comment
threads describe, and add one `document-edits` component to the reply. It SHALL only read the
saved document and write to the Project's database; the document's file SHALL NOT change. Inside
a comment thread the tool SHALL fail with `in_thread`.

#### Scenario: Scribe edits a referenced document
- **WHEN** Scribe, answering "tighten the methods in #Trial report", calls edit-a-document on
  "Trial report.qmd" with two edits whose quotes each occur once
- **THEN** two threads open on the quoted passages, a `document-edits` card for "Trial report"
  is added to Scribe's reply, and the file is unchanged

#### Scenario: A quote that occurs twice
- **WHEN** one edit's `find` is "Huancayo", which occurs three times
- **THEN** the call fails with `passage_not_unique` naming that edit, and no thread or card is
  added

#### Scenario: A document the message does not reference
- **WHEN** Scribe calls edit-a-document on a document the message neither references nor
  attaches
- **THEN** the call fails with `document_not_referenced`

### Requirement: Checks on a document edit
The tool SHALL send the edits to the Rust core with the `document.edit` request,
`{ asset_id, edits: [{ find, replace, reason }] }`, whose result is `{ component_id, threads }`.
The core SHALL fail the request, changing nothing, with `document_not_referenced` unless the
document is a `.qmd` Asset of the Project that the message being answered `#`-references or
attaches; with `passage_not_found` or `passage_not_unique` naming the edit unless its `find`
occurs exactly once in the saved document; and with `edits_overlap` when two edits overlap.

#### Scenario: Overlapping edits
- **WHEN** two edits quote "above 3,800 m" and "3,800 m in both"
- **THEN** the call fails with `edits_overlap`, and no thread or card is added

### Requirement: Events of a document edit
A successful `document.edit` SHALL add, in each new thread's Conversation, `message.created`
with the Mini-Me's message (its reason as `content`, status complete) and `component.added`
with its `suggestion`; and in the reply's Conversation, `component.added` with the
`document-edits` component. No other protocol event SHALL change.

#### Scenario: What the UI receives
- **WHEN** Scribe's call edits a document with two edits
- **THEN** each new thread's Conversation gets one `message.created` and one `component.added`,
  and Scribe's reply gets one `component.added` for the `document-edits` card
