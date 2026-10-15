# Spec Delta

## MODIFIED Requirements

### Requirement: Version handshake
On start, the sidecar SHALL send `hello` with payload fields `protocol` (integer),
`sidecar_version` (string) and `python_version` (string) before any other frame. The Rust
core SHALL use the sidecar only when `protocol` equals the protocol version it implements,
and only after `hello` arrives within the start timeout.

#### Scenario: Matching versions
- **WHEN** the sidecar sends `hello` with the protocol version the core implements
- **THEN** the core lists the sidecar's adapters and the sidecar becomes ready

#### Scenario: No hello in time
- **WHEN** the sidecar does not send `hello` within the start timeout
- **THEN** the core stops the process and treats it as a failed start
