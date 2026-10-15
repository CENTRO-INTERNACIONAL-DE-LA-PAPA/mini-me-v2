# credentials Specification

## Purpose

Defines how provider secrets (such as AI provider API keys) reach the Traits that need them
while staying out of files, logs and events: when a secret is released, to which Trait, and
how both processes keep it from leaking.

## Requirements

### Requirement: Secrets are released per call
A Trait SHALL obtain a secret only by sending `core.request` with method `secret.get`, params
`{ provider }`, during one of its calls; the routing module SHALL obtain the Typesafe key the
same way during a routing request. On success the result SHALL be `{ value }`. The sidecar
SHALL hold the value only for that call or request and SHALL NOT reuse it in another.

#### Scenario: Secret for a declared provider
- **WHEN** a running Trait that declares provider `dummy` requests the `dummy` secret and the
  core's secret source has one
- **THEN** the response carries the secret value

#### Scenario: Each call asks again
- **WHEN** the same Trait runs twice
- **THEN** each call sends its own `secret.get` request

#### Scenario: Routing request
- **WHEN** a routing request asks for the `typesafe` secret
- **THEN** the core answers with the saved Typesafe key, and refuses any other provider with
  `secret_not_allowed`

### Requirement: Only declared providers
The Rust core SHALL refuse `secret.get` with code `secret_not_allowed` when the provider is
not in the `providers` list the call's adapter declared at discovery, or when it differs from
the provider in the call's `model`.

#### Scenario: Undeclared provider
- **WHEN** a call of an adapter whose `providers` list is empty requests a secret for `openai`
- **THEN** the request fails with code `secret_not_allowed` and no secret is read

#### Scenario: Provider other than the call's
- **WHEN** a prompt adapter call whose `model.provider` is `anthropic` requests the `openai`
  secret
- **THEN** the request fails with code `secret_not_allowed` and no secret is read

### Requirement: Missing secrets
When the OS keychain holds no API key for the requested provider, `secret.get` SHALL fail
with code `secret_unavailable`, and the reply SHALL fail with that code and a message naming
the provider and pointing to Settings.

#### Scenario: No secret source
- **WHEN** the provider is OpenAI, no OpenAI key is saved, and the user asks Scribe for a
  summary
- **THEN** the reply fails with code `secret_unavailable` and says to add an OpenAI API key in
  Settings

### Requirement: Secrets stay in memory
Neither process SHALL write a secret to a file, to environment variables, to a Project
folder, to an event or to a log. Outside the OS keychain, a secret SHALL exist only in memory
and on the link inside the `core.response` that answers its request.

#### Scenario: Secret not in events
- **WHEN** a Trait that received the dummy secret finishes its call
- **THEN** no persisted event of the Conversation contains the secret value

#### Scenario: Key not in settings
- **WHEN** the user saves an API key in Settings
- **THEN** the app settings file contains no part of the key

### Requirement: Secrets are redacted in logs
Whenever either process logs a frame or a value that holds a secret, it SHALL replace the
secret with `[redacted]`. Error messages SHALL NOT contain a secret.

#### Scenario: Logged response
- **WHEN** frame logging is enabled and a `secret.get` response is sent
- **THEN** the sidecar log shows the response with `value` as `[redacted]`

### Requirement: API keys in the OS keychain
The Rust core SHALL store each provider's API key in the OS keychain (Windows Credential
Manager, macOS Keychain) under the service `org.cipotato.mini-me` and the provider ID as the
account. Keys SHALL be read from the keychain for each `secret.get` and not cached.

#### Scenario: Key survives a restart
- **WHEN** the user saves an Anthropic key and restarts Mini-Me
- **THEN** Scribe can use Anthropic without the key being entered again

### Requirement: Managing keys in Settings
Settings SHALL show, for each AI provider and for Typesafe, whether a key is saved, and let
the user save a new key, replace it or remove it. The UI SHALL never receive a saved key back
from the core; keys flow only from the UI to the core.

#### Scenario: Saved key is not shown
- **WHEN** an OpenAI key is saved and the user opens Settings
- **THEN** Settings shows that an OpenAI key is saved, without showing any part of it

#### Scenario: Removing a key
- **WHEN** the user removes the Google key
- **THEN** it is deleted from the keychain and Google calls fail with `secret_unavailable`

#### Scenario: Typesafe key
- **WHEN** the user saves a Typesafe key
- **THEN** it is stored in the OS keychain under the account `typesafe`, and the next
  message without a mention is routed by Jev
