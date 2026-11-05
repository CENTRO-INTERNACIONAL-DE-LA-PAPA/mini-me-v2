# Spec Delta

## MODIFIED Requirements

### Requirement: Managing keys in Settings
Settings SHALL show, for each AI provider, for Typesafe and for CIP Dataverse, whether a key is
saved, and let
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

#### Scenario: CIP Dataverse token
- **WHEN** the user saves a CIP Dataverse token in Settings → Accounts
- **THEN** it is stored in the OS keychain under the account `dataverse`, and is never released
  to a Trait call
