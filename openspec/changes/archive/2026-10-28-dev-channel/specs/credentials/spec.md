# Spec Delta

## MODIFIED Requirements

### Requirement: API keys in the OS keychain
The Rust core SHALL store each provider's API key in the OS keychain (Windows Credential
Manager, macOS Keychain) under the running app's identifier as the service
(`org.cipotato.mini-me`, or `org.cipotato.mini-me.dev` for Mini-Me Dev) and the provider ID
as the account. Keys SHALL be read from the keychain for each `secret.get` and not cached.

#### Scenario: Key survives a restart
- **WHEN** the user saves an Anthropic key and restarts Mini-Me
- **THEN** Scribe can use Anthropic without the key being entered again

#### Scenario: Keys per app
- **WHEN** the user has saved an Anthropic key in Mini-Me and opens Mini-Me Dev
- **THEN** Mini-Me Dev shows no Anthropic key until one is saved in it
