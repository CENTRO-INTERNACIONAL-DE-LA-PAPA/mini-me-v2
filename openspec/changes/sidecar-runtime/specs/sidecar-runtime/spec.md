# Spec Delta

## Purpose

Defines the Python sidecar process that executes Traits: how its runtime is pinned and
shipped, how the Rust core starts, checks and supervises it, how the two sides agree on a
protocol version, and what the user sees about its state.

## ADDED Requirements

### Requirement: Pinned runtime shipped with the app
The sidecar's Python version and every Python package it uses SHALL be pinned in the
repository. A release build SHALL contain that Python runtime and those packages, so the
installed app runs the sidecar without any Python, `uv` or other system-level prerequisite on
the user's machine, and ignores any Python installation or Python environment variables
already present.

#### Scenario: Machine without Python
- **WHEN** a release build is installed on a Windows, macOS or Linux machine with no Python
  installed and the app is opened
- **THEN** the sidecar starts and reaches the ready state

#### Scenario: User's own Python environment is ignored
- **WHEN** the user's environment sets `PYTHONPATH` or `PYTHONHOME`, or has packages in the
  user site-packages folder
- **THEN** the sidecar starts with only the bundled runtime and packages

### Requirement: Development launch
In a development build, the Rust core SHALL start the sidecar from the repository's
`sidecar/` folder through `uv`, using the pinned Python version and the lockfile without
modifying it.

#### Scenario: Running in development
- **WHEN** a developer runs the app in development mode with `uv` installed
- **THEN** the sidecar starts from the repository sources and reaches the ready state

### Requirement: Link framing
The Rust core and the sidecar SHALL exchange one JSON object per line, UTF-8 encoded, over
the sidecar's standard input and standard output. Each object SHALL have a `type` field
naming the frame. The sidecar SHALL write nothing but frames to its protocol output; all
other output, including from native libraries, SHALL go to standard error.

#### Scenario: Library output does not corrupt the link
- **WHEN** code running in the sidecar prints text to standard output
- **THEN** the text goes to the sidecar log and the link keeps working

#### Scenario: Unreadable line
- **WHEN** the Rust core reads a line from the sidecar that is not a JSON object with a
  `type`
- **THEN** it logs the line and ignores it

#### Scenario: Unknown frame type
- **WHEN** either side receives a frame whose `type` it does not recognize
- **THEN** it ignores the frame and keeps processing later frames

### Requirement: Version handshake
On start, the sidecar SHALL send `hello` with payload fields `protocol` (integer),
`sidecar_version` (string) and `python_version` (string) before any other frame. The Rust
core SHALL use the sidecar only when `protocol` equals the protocol version it implements,
and only after `hello` arrives within the start timeout.

#### Scenario: Matching versions
- **WHEN** the sidecar sends `hello` with the protocol version the core implements
- **THEN** the core lists the sidecar's Traits and the sidecar becomes ready

#### Scenario: No hello in time
- **WHEN** the sidecar does not send `hello` within the start timeout
- **THEN** the core stops the process and treats it as a failed start

### Requirement: Version mismatch is reported, not retried
When the protocol versions differ, the Rust core SHALL stop the sidecar, SHALL NOT restart
it, and SHALL report the incompatible state with both versions. The message SHALL tell the
user to reinstall Mini-Me. In a development build it SHALL also name the side with the lower
version as the stale one.

#### Scenario: Partial update
- **WHEN** a release build's sidecar reports protocol 1 and the core implements protocol 2
- **THEN** the sidecar status is incompatible, the message names versions 1 and 2 and asks
  the user to reinstall Mini-Me, and no restart is attempted

#### Scenario: Stale sidecar in development
- **WHEN** in a development build the sidecar reports protocol 1 and the core implements 2
- **THEN** the message says the sidecar is the stale side

### Requirement: Sidecar status
The Rust core SHALL track the sidecar's status as one of `starting`, `ready`, `restarting`,
`stopped` or `incompatible`, and SHALL let the UI read the current status and receive every
change. Each status SHALL carry a human-readable `detail` when it is not `ready`.

#### Scenario: Status after launch
- **WHEN** the app opens
- **THEN** the UI shows the sidecar as starting, then as ready once the handshake succeeds

#### Scenario: Status change while open
- **WHEN** the sidecar's status changes while the app is open
- **THEN** the UI shows the new status without reloading

### Requirement: Responsiveness check
While the sidecar is ready, the Rust core SHALL send `ping` frames (payload `{ nonce }`) at a
fixed interval, and the sidecar SHALL answer each with `pong` carrying the same `nonce`, even
while Trait calls are running. If no `pong` arrives within the response timeout, the core
SHALL stop the process and handle it as a stopped sidecar.

#### Scenario: Busy sidecar still answers
- **WHEN** several Trait calls are streaming and a `ping` is sent
- **THEN** the sidecar answers with `pong` within the response timeout

#### Scenario: Hung sidecar
- **WHEN** the sidecar stops answering `ping`
- **THEN** the core stops the process and restarts it as for an unexpected stop

### Requirement: Restart with backoff
When the sidecar process exits unexpectedly, fails to start or is stopped for not
responding, the Rust core SHALL restart it after a delay that grows with each consecutive
failure. After five consecutive failures it SHALL stop retrying and report `stopped`. A
sidecar that stays ready for 60 seconds SHALL reset the failure count.

#### Scenario: One crash
- **WHEN** the ready sidecar's process is killed
- **THEN** the status becomes `restarting`, then `ready` again without user action

#### Scenario: Repeated crashes
- **WHEN** the sidecar fails five times in a row without staying ready for 60 seconds
- **THEN** the status becomes `stopped` with a detail explaining that Mini-Me's runtime
  could not be started, and no further restart is attempted

### Requirement: Manual restart
The user SHALL be able to ask for the sidecar to be started again when its status is
`stopped`. This SHALL reset the failure count and start the sidecar as at launch.

#### Scenario: Try again
- **WHEN** the status is `stopped` and the user chooses to try again
- **THEN** the status becomes `starting` and the sidecar is started

### Requirement: Sidecar ends with the app
On app exit the Rust core SHALL send `shutdown` (empty payload) and stop the process if it
has not exited within a short grace period. The sidecar SHALL exit on its own when its
standard input closes, so it does not outlive a Rust core that ended unexpectedly.

#### Scenario: Normal exit
- **WHEN** the user closes the app
- **THEN** no sidecar process remains running

#### Scenario: Core ends unexpectedly
- **WHEN** the Rust core process is killed
- **THEN** the sidecar process exits

### Requirement: Sidecar log
The Rust core SHALL write the sidecar's standard error and the core's sidecar diagnostics to
a size-limited log file in the app's log directory. The log SHALL never be written inside the
Mini-Me Data folder or a Project folder.

#### Scenario: Diagnosing a crash
- **WHEN** the sidecar stops because of an unhandled error
- **THEN** the error's traceback is in the sidecar log file

### Requirement: Sidecar holds no durable state
The sidecar SHALL NOT keep state that must survive a restart and SHALL NOT read or write
files in the Mini-Me Data folder. Everything it needs about a Project SHALL come from the
Rust core over the link.

#### Scenario: Restart loses nothing
- **WHEN** the sidecar restarts while no Trait call is running
- **THEN** every Project, Conversation, message and Asset is unchanged and new calls work
