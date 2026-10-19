# Spec Delta

## MODIFIED Requirements

### Requirement: Requests from a Trait to the Rust core
During a Trait call, a model decision or a routing request, the sidecar SHALL be able to
send `core.request`, payload `{ request_id, call_id, method, params }`. Here `call_id` is
the call's ID from `step.started`, or the routing request's `route_id`. The core SHALL
answer each with `core.response`, payload `{ request_id, result }` or `{ request_id, error:
{ code, message } }`.

#### Scenario: Request after the call ended
- **WHEN** the sidecar sends `core.request` for a call whose Step has completed
- **THEN** the core answers with error code `call_not_active`

#### Scenario: Asset read from a routing request
- **WHEN** the sidecar sends `asset.read` with a routing request's `route_id`
- **THEN** the core answers with error code `unknown_method`

#### Scenario: Model decision
- **WHEN** a condition's decision sends `asset.read`, `component.add`, `asset.write`,
  `conversation.results` or `component.read`
- **THEN** the core answers with error code `unknown_method`; only `secret.get` is allowed

#### Scenario: Unknown method or ended run
- **WHEN** the sidecar sends a method the core does not know, or a request for a call whose
  run has ended
- **THEN** the core answers with `unknown_method` or `call_not_active`

### Requirement: Link protocol version
The link protocol version SHALL be 6. The Rust core and the sidecar both implement adapter
discovery, Mini-Me runs (`run.start`, `run.cancel` and the `run.*` and `step.*` frames), the
routing request, and the `component.add`, `asset.write`, `conversation.results` and
`component.read` requests. A side still at an earlier version SHALL be reported as a
version mismatch.

#### Scenario: Old sidecar
- **WHEN** a development build's core implementing version 6 starts a sidecar that sends
  `hello` with protocol 5
- **THEN** the sidecar is shown as `incompatible`, naming both versions
