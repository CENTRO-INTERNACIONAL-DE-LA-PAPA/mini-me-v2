# Spec Delta

## ADDED Requirements

### Requirement: Reload in development
In a development build, when a Python file under the repository's `sidecar/src` folder changes,
the Rust core SHALL restart the sidecar as soon as no Trait call, routing request, summary or
draft is in flight, so later calls run the changed code. The status SHALL show `restarting`
meanwhile. A reload SHALL NOT count as a failure toward the restart limit, and a change SHALL
also restart a `stopped` sidecar as "Try again" does. A release build SHALL NOT watch the
sidecar's files.

#### Scenario: Change while idle
- **WHEN** in a development build no reply is being written and a developer saves a change to
  a file under `sidecar/src`
- **THEN** within a few seconds the status becomes `restarting`, then `ready`, and the next
  message is answered by the changed code

#### Scenario: Change while a reply is written
- **WHEN** in a development build a developer saves a change to a file under `sidecar/src`
  while a reply is being written
- **THEN** the reply finishes on the code it started with, and the sidecar restarts once no
  call is in flight

#### Scenario: Reloads are not failures
- **WHEN** in a development build the sidecar is reloaded more than five times in a row
- **THEN** it is ready again after each reload and its status never becomes `stopped`

#### Scenario: Fixing a broken file
- **WHEN** in a development build a saved error stopped the sidecar and the developer saves the
  fixed file
- **THEN** the status becomes `starting`, then `ready`, without choosing "Try again"

#### Scenario: Release build
- **WHEN** a file in the installed app's sidecar folder changes
- **THEN** the sidecar keeps running and is not restarted
