# Spec Delta

## MODIFIED Requirements

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
