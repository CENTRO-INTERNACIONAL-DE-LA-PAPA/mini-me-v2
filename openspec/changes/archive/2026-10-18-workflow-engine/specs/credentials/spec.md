# Spec Delta

## MODIFIED Requirements

### Requirement: Secrets are released per call
A Trait SHALL obtain a secret only by sending `core.request` with method `secret.get`, params
`{ provider }`, during one of its calls; a condition's or loop's model decision SHALL do the
same during its own call, and the routing module during a routing request. On success the
result SHALL be `{ value }`. The sidecar SHALL hold the value only for that call or request
and SHALL NOT reuse it in another, even within the same run.

#### Scenario: Secret for a declared provider
- **WHEN** a running Trait that declares provider `dummy` requests the `dummy` secret and the
  core's secret source has one
- **THEN** the response carries the secret value

#### Scenario: Each call asks again
- **WHEN** the same Trait runs twice
- **THEN** each call sends its own `secret.get` request

#### Scenario: Two Steps of one run
- **WHEN** Investigator's *Plan* and *Refute* Steps run in one run
- **THEN** each of their calls sends its own `secret.get` request

#### Scenario: Routing request
- **WHEN** a routing request asks for the `typesafe` secret
- **THEN** the core answers with the saved Typesafe key, and refuses any other provider with
  `secret_not_allowed`

### Requirement: Only declared providers
The Rust core SHALL refuse `secret.get` with code `secret_not_allowed` when the provider is
not in the `providers` list that the adapter of the call's Trait declared at discovery, or
when it differs from the provider in the run's `model`. A model decision SHALL get only the
secret of the run's `model.provider`.

#### Scenario: Undeclared provider
- **WHEN** a call of an adapter whose `providers` list is empty requests a secret for `openai`
- **THEN** the request fails with code `secret_not_allowed` and no secret is read

#### Scenario: Provider other than the call's
- **WHEN** a prompt adapter call whose `model.provider` is `anthropic` requests the `openai`
  secret
- **THEN** the request fails with code `secret_not_allowed` and no secret is read

#### Scenario: Model decision
- **WHEN** a condition's decision, in a run whose `model.provider` is `openai`, requests the
  `openai` secret
- **THEN** the response carries the OpenAI key
