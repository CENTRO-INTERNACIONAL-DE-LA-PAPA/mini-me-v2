# Spec Delta

## MODIFIED Requirements

### Requirement: Missing secrets
When the OS keychain holds no API key for the requested provider, `secret.get` SHALL fail
with code `secret_unavailable`, and the reply SHALL fail with that code and a message naming
the provider and pointing to Settings. The one exception is `custom`: with no Custom key saved,
`secret.get` SHALL succeed with an empty `value`, and the call SHALL be sent with a fixed
placeholder key, `not-needed`, that servers without auth ignore.

#### Scenario: No secret source
- **WHEN** the provider is OpenAI, no OpenAI key is saved, and the user asks Scribe for a
  summary
- **THEN** the reply fails with code `secret_unavailable` and says to add an OpenAI API key in
  Settings

#### Scenario: Custom endpoint without a key
- **WHEN** the provider is Custom, no Custom key is saved, and the user asks Scribe for a
  summary
- **THEN** `secret.get` answers `{ value: "" }`, and the request goes to the endpoint with
  the placeholder key `not-needed`

### Requirement: Managing keys in Settings
Settings SHALL show, for each AI provider, for Typesafe and for CIP Dataverse, whether a key is
saved, and let
the user save a new key, replace it or remove it. The UI SHALL never receive a saved key back
from the core; keys flow only from the UI to the core. The Custom row SHALL say that its key is
needed only if the endpoint asks for one.

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

#### Scenario: CIP Dataverse token
- **WHEN** the user saves a CIP Dataverse token in Settings → Accounts
- **THEN** it is stored in the OS keychain under the account `dataverse`, and is never released
  to a Trait call

#### Scenario: Custom key
- **WHEN** the user saves a Custom key
- **THEN** it is stored in the OS keychain under the account `custom`, and Custom calls send it
  to the endpoint
