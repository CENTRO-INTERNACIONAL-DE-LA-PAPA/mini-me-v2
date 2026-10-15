# Spec Delta

## MODIFIED Requirements

### Requirement: Requests from a Trait to the Rust core
During a call or a routing request, the sidecar SHALL be able to send `core.request`,
payload `{ request_id, call_id, method, params }`, where `call_id` is the call's ID or the
routing request's `route_id`. The core SHALL answer each with `core.response`, payload
`{ request_id, result }` or `{ request_id, error: { code, message } }`. A request for a call
or routing request that is not running SHALL fail with code `call_not_active`; an unknown
method with `unknown_method`. A routing request SHALL only be able to use `secret.get`.

#### Scenario: Request after the call ended
- **WHEN** the sidecar sends `core.request` for a call that has ended
- **THEN** the core answers with error code `call_not_active`

#### Scenario: Asset read from a routing request
- **WHEN** the sidecar sends `asset.read` with a routing request's `route_id`
- **THEN** the core answers with error code `unknown_method`

### Requirement: Link protocol version
The link protocol version SHALL be 3: the Rust core and the sidecar both implement adapter
discovery, the `call.start` payload defined here and the routing request, and a side still
at an earlier version SHALL be reported as a version mismatch.

#### Scenario: Old sidecar
- **WHEN** a development build's core implementing version 3 starts a sidecar that sends
  `hello` with protocol 2
- **THEN** the sidecar is shown as `incompatible`, naming both versions

### Requirement: Echo adapter
The sidecar SHALL provide the `echo` adapter, used by tests and development: its input is
`{ text }` and it streams that text back one word at a time, keeping the original
whitespace, then ends with `call.done`. It declares no providers and ignores `trait` and
`model`. No Trait in the built-in library uses it.

#### Scenario: Echo output
- **WHEN** the `echo` adapter runs with the text "What causes late blight?"
- **THEN** its deltas concatenate to "What causes late blight?" and the call ends with
  `call.done`

## RENAMED Requirements

- FROM: `### Requirement: Link protocol version 2`
- TO: `### Requirement: Link protocol version`
- FROM: `### Requirement: Echo Trait`
- TO: `### Requirement: Echo adapter`

## ADDED Requirements

### Requirement: Context carries the routing answer
`call.start`'s `context` SHALL include `needs_context`: `true`, `false`, or `null`, as the
routing decision for the message answered. Adapters MAY ignore it.

#### Scenario: Unknown
- **WHEN** a reply starts without a routing decision
- **THEN** its `call.start` has `context.needs_context: null`
