# Spec Delta

## Purpose

Defines how provider secrets (such as AI provider API keys) reach the Traits that need them
while staying out of files, logs and events: when a secret is released, to which Trait, and
how both processes keep it from leaking.

## ADDED Requirements

### Requirement: Secrets are released per call
A Trait SHALL obtain a secret only by sending `core.request` with method `secret.get`, params
`{ provider }`, during one of its calls. On success the result SHALL be `{ value }`. The
sidecar SHALL hold the value only for that call and SHALL NOT reuse it in another call.

#### Scenario: Secret for a declared provider
- **WHEN** a running Trait that declares provider `dummy` requests the `dummy` secret and the
  core's secret source has one
- **THEN** the response carries the secret value

#### Scenario: Each call asks again
- **WHEN** the same Trait runs twice
- **THEN** each call sends its own `secret.get` request

### Requirement: Only declared providers
The Rust core SHALL refuse `secret.get` with code `secret_not_allowed` when the provider is
not in the `providers` list the Trait declared at discovery.

#### Scenario: Undeclared provider
- **WHEN** a Trait whose `providers` list is empty requests a secret for `openai`
- **THEN** the request fails with code `secret_not_allowed` and no secret is read

### Requirement: Missing secrets
When the Rust core has no secret for a declared provider, `secret.get` SHALL fail with code
`secret_unavailable`. This version of the app has no secret store, so every request outside
of tests fails this way.

#### Scenario: No secret source
- **WHEN** a Trait requests a declared provider's secret in the installed app
- **THEN** the request fails with code `secret_unavailable`

### Requirement: Secrets stay in memory
Neither process SHALL write a secret to disk, to environment variables, to a Project folder,
to an event or to a log. A secret SHALL exist only in memory and on the link inside the
`core.response` that answers its request.

#### Scenario: Secret not in events
- **WHEN** a Trait that received the dummy secret finishes its call
- **THEN** no persisted event of the Conversation contains the secret value

### Requirement: Secrets are redacted in logs
Whenever either process logs a frame or a value that holds a secret, it SHALL replace the
secret with `[redacted]`. Error messages SHALL NOT contain a secret.

#### Scenario: Logged response
- **WHEN** frame logging is enabled and a `secret.get` response is sent
- **THEN** the sidecar log shows the response with `value` as `[redacted]`
