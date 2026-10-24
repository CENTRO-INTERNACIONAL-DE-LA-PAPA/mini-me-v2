## MODIFIED Requirements

### Requirement: Link protocol version
The link protocol version SHALL be 8. The Rust core and the sidecar both implement adapter
discovery, Mini-Me runs (`run.start`, `run.cancel` and the `run.*` and `step.*` frames), the
routing request, the summary request (`summary.start`, `summary.done` and `summary.error`),
and the `component.add`, `asset.write`, `conversation.results` and `component.read`
requests, with `component` Text Components, `current` components and `source_asset_id`. A
side still at an earlier version SHALL be reported as a version mismatch.

#### Scenario: Old sidecar
- **WHEN** a development build's core implementing version 8 starts a sidecar that sends
  `hello` with protocol 7
- **THEN** the sidecar is shown as `incompatible`, naming both versions
