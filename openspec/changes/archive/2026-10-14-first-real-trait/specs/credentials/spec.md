# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: API keys in the OS keychain
The Rust core SHALL store each provider's API key in the OS keychain (Windows Credential
Manager, macOS Keychain) under the service `org.cipotato.mini-me` and the provider ID as the
account. Keys SHALL be read from the keychain for each `secret.get` and not cached.

#### Scenario: Key survives a restart
- **WHEN** the user saves an Anthropic key and restarts Mini-Me
- **THEN** Scribe can use Anthropic without the key being entered again

### Requirement: Managing keys in Settings
Settings SHALL show, for each provider, whether a key is saved, and let the user save a new
key, replace it or remove it. The UI SHALL never receive a saved key back from the core;
keys flow only from the UI to the core.

#### Scenario: Saved key is not shown
- **WHEN** an OpenAI key is saved and the user opens Settings
- **THEN** Settings shows that an OpenAI key is saved, without showing any part of it

#### Scenario: Removing a key
- **WHEN** the user removes the Google key
- **THEN** it is deleted from the keychain and Google calls fail with `secret_unavailable`
