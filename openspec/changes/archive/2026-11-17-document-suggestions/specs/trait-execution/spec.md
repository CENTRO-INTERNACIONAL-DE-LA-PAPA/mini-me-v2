## MODIFIED Requirements

### Requirement: Link protocol version
The link protocol version SHALL be 18. The Rust core and the sidecar both implement adapter
discovery, Mini-Me runs (`run.start`, `run.cancel` and the `run.*` and `step.*` frames), the
routing request, the summary request (`summary.start`, `summary.done` and `summary.error`),
and the `component.add`, `asset.write`, `conversation.results`, `component.read` and
`document.suggest` requests, with `current` Assets, component `preview`, `source_asset_id` and
`source`, hidden files and Traits without tools, and without `component` Text Components or the
`document.edit` request. A side still at an earlier version SHALL be reported as a version
mismatch.

#### Scenario: Old sidecar
- **WHEN** a development build's core implementing version 18 starts a sidecar that sends
  `hello` with protocol 17
- **THEN** the sidecar is shown as `incompatible`, naming both versions
