## MODIFIED Requirements

### Requirement: Writing an Asset
During a call, the method `asset.write`, params `{ name, media_type, data, hidden }` with
`data` the base64 of the file's bytes (at most 32 MiB decoded) and `hidden` a boolean
(default `false`), SHALL store the file in the call's Project, register it as an Asset with
source `generated` and that `hidden` flag, and return `{ asset }` (`id`, `name`,
`media_type`, `size_bytes`). A file that is not hidden SHALL be added to the reply with
`attachment.added`; a hidden file SHALL NOT be attached.

#### Scenario: Validation report saved
- **WHEN** a Validate Data call writes `field-trial-validation.html`
- **THEN** the reply shows the attachment `field-trial-validation.html`, and opening it shows
  the written content

#### Scenario: Theory Store saved
- **WHEN** a Theorize call writes `theory-store.json` with `hidden` `true`
- **THEN** the file is stored in the Project and returned with its ID, and the reply shows no
  attachment for it

#### Scenario: After the reply ended
- **WHEN** the sidecar sends `asset.write` for a call that has ended
- **THEN** the core answers with error code `call_not_active`, and no file is written

### Requirement: Written Assets stay in the Project
The core SHALL choose where a written Asset is stored, hidden or not: `assets/<asset id>/<name>`
inside the call's Project, resolved through the Project-folder confinement check. A `name`
that is empty, longer than 255 characters, or holds a path separator, `..` or a character that
Windows forbids in file names SHALL fail with `invalid_input`, and nothing is written. No
file path SHALL be sent to the sidecar.

#### Scenario: Name with a path
- **WHEN** a Trait writes an Asset named `../../notes.txt`
- **THEN** the request fails with `invalid_input`, and nothing is written inside or outside
  the Project

#### Scenario: Same name twice
- **WHEN** two calls each write `theory-store.json`
- **THEN** both files are kept, each with its own Asset ID

### Requirement: Link protocol version
The link protocol version SHALL be 16. The Rust core and the sidecar both implement adapter
discovery, Mini-Me runs (`run.start`, `run.cancel` and the `run.*` and `step.*` frames), the
routing request, the summary request (`summary.start`, `summary.done` and `summary.error`),
and the `component.add`, `asset.write`, `conversation.results` and `component.read`
requests, with `current` Assets, component `preview`, `source_asset_id` and `source`, and
hidden files, and without `component` Text Components. A side still at an earlier version
SHALL be reported as a version mismatch.

#### Scenario: Old sidecar
- **WHEN** a development build's core implementing version 16 starts a sidecar that sends
  `hello` with protocol 15
- **THEN** the sidecar is shown as `incompatible`, naming both versions
