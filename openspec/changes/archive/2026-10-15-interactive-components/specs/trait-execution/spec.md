# Spec Delta

## ADDED Requirements

### Requirement: Writing an Asset
During a call, the method `asset.write`, params `{ name, media_type, data }` with `data` the
base64 of the file's bytes (at most 32 MiB decoded), SHALL store the file in the call's
Project, register it as an Asset with source `generated`, add it to the reply with
`attachment.added`, and return `{ asset }` (`id`, `name`, `media_type`, `size_bytes`).

#### Scenario: Theory Store saved
- **WHEN** a Theorize call writes `theory-store.json` with media type `application/json`
- **THEN** the reply shows the attachment `theory-store.json`, and opening it shows the
  written content

#### Scenario: After the reply ended
- **WHEN** the sidecar sends `asset.write` for a call that has ended
- **THEN** the core answers with error code `call_not_active`, and no file is written

### Requirement: Written Assets stay in the Project
The core SHALL choose where a written Asset is stored: `assets/<asset id>/<name>` inside
the call's Project, resolved through the Project-folder confinement check. A `name` that is
empty, longer than 255 characters, or holds a path separator, `..` or a character that
Windows forbids in file names SHALL fail with `invalid_input`, and nothing is written. No
file path SHALL be sent to the sidecar.

#### Scenario: Name with a path
- **WHEN** a Trait writes an Asset named `../../notes.txt`
- **THEN** the request fails with `invalid_input`, and nothing is written inside or outside
  the Project

#### Scenario: Same name twice
- **WHEN** two calls each write `theory-store.json`
- **THEN** both files are kept, each with its own Asset ID

## MODIFIED Requirements

### Requirement: Reserved frame types
The frame type `call.input_requested` (asking the user for input during a call) is reserved
for later versions. The sidecar SHALL NOT send it in this protocol version, and the core
SHALL ignore it. Interactive Components are added with the `component.add` request, never
with a frame, so the core also ignores a `call.component` frame.

#### Scenario: Reserved frame received
- **WHEN** the core receives `call.input_requested` or `call.component`
- **THEN** it ignores the frame and the call continues

### Requirement: Link protocol version
The link protocol version SHALL be 4: the Rust core and the sidecar both implement adapter
discovery, the `call.start` payload defined here, the routing request and the
`component.add` and `asset.write` requests. A side still at an earlier version SHALL be
reported as a version mismatch.

#### Scenario: Old sidecar
- **WHEN** a development build's core implementing version 4 starts a sidecar that sends
  `hello` with protocol 3
- **THEN** the sidecar is shown as `incompatible`, naming both versions
