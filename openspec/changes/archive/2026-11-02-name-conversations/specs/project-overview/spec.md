# Spec Delta

## MODIFIED Requirements

### Requirement: Summary request on the link
The core SHALL ask the sidecar for a summary with `summary.start`, payload
`{ summary_id, model: { provider, model }, material, kind }`, where `summary_id` is a new UUIDv7 and
`kind` is `overview` for the Overview's summary or `title` for a Conversation's title. The sidecar
SHALL get the provider's key with `secret.get` using `summary_id` as the `call_id`, and answer with
exactly one of `summary.done { summary_id, text }` and `summary.error { summary_id, error: { code,
message } }`.

#### Scenario: Summary written
- **WHEN** the core sends `summary.start` with a model whose key is saved
- **THEN** the sidecar answers `summary.done` with the summary's text

#### Scenario: Key missing
- **WHEN** the core sends `summary.start` and the provider has no key
- **THEN** the sidecar answers `summary.error` with code `secret_unavailable`

#### Scenario: A title
- **WHEN** the core sends `summary.start` with `kind` `title` and a Conversation's first message
- **THEN** the sidecar answers `summary.done` with a short title
