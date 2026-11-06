# Spec Delta

## ADDED Requirements

### Requirement: Third-party software ships with each release
Every release build SHALL bundle a file inside the app holding Mini-Me's `NOTICE` and license,
and each third-party component the app ships (the Rust crates of the core, the npm packages
built into the UI, and the sidecar's Python packages and runtime) with its part of the app,
name, version, repository when it has one, and the license and notice texts it ships. A
component that ships no license text SHALL be listed with the license it declares. A release
build SHALL fail when a component declares no license.

#### Scenario: A release build
- **WHEN** a release is built
- **THEN** the file lists a Rust crate such as `serde`, an npm package such as `react` and a
  Python package such as `pandas`, each with its license text

#### Scenario: A component without a license
- **WHEN** a shipped component declares no license
- **THEN** the release build fails and names the component
