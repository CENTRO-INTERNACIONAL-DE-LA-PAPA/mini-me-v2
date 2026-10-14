# Proposal

## Why

Every Trait (*Summarize*, *Find Papers*, *Theorize*, …) will run in Python, because that is
where the AI SDKs, LangGraph and Asta live. Before any of them can exist, Mini-Me needs the
Python sidecar itself: a pinned runtime shipped with the app, started and kept alive by the
Rust core, and one Trait interface rich enough for the Traits on the roadmap. Building it now,
with only the echo responder as its first Trait, lets us prove the process model, the
protocol and the packaging (including how antivirus software reacts to a bundled Python)
before real Traits, API keys and costs depend on it.

## What Changes

- Add a **Python sidecar** (`sidecar/`) whose Python version and dependencies are pinned
  with `uv` (`.python-version`, `pyproject.toml`, `uv.lock`).
- **Development:** the Rust core starts the sidecar with `uv run`. **Release:** the app
  bundles a standalone Python runtime plus the locked packages, so users need no Python or
  `uv` installed.
- The Rust core **supervises** the sidecar: it starts it at launch, checks it is responsive,
  restarts it with backoff if it stops or hangs, gives up after a limit, and shows the
  sidecar's status in the UI with a way to try again.
- Add the **sidecar link protocol**: newline-delimited JSON over stdin/stdout, beginning with
  a **version handshake**. On a version mismatch the app does not use the sidecar and shows
  an error naming both versions; in development it also names the stale side.
- Add the **Trait interface**, used by every Trait regardless of provider:
  - discovery of Traits (ID, name, description, input schema, declared providers);
  - concurrent Trait calls, each with its own call ID;
  - streamed text output, optional progress updates, cooperative cancellation;
  - exactly one final outcome per call: done, error or cancelled;
  - an error boundary per call, so a failing Trait never stops the sidecar or other calls;
  - requests from a Trait to the Rust core during a call: reading an Asset of the call's
    Project, and requesting a provider secret.
- Define **secret handling** for Traits: a secret is released only during a call, only for a
  provider the Trait declared, kept in memory only, and redacted from protocol logs on both
  sides. This change ships no real secret source (keychain storage arrives with the first
  real Trait), so it is exercised with a dummy secret in tests.
- **Move the echo responder into Python** as the first Trait, *Echo*. The Rust echo module is
  removed; replies are now produced by Trait calls.
- Add the `message.progress` event so a reply can show what a Trait is doing.
- Reserve, but do not implement, protocol space for asking the user for input during a call
  (approvals) and for Interactive Component output.

## Capabilities

### New Capabilities

- `sidecar-runtime`: the sidecar process: pinned runtime, development and release launch,
  link protocol framing, version handshake, supervision, restart and status shown to the
  user.
- `trait-execution`: the Trait interface: discovery, Trait calls and their lifecycle,
  streaming, progress, cancellation, final outcomes, per-call error isolation, and requests
  from a Trait to the Rust core (Asset reads).
- `credentials`: how provider secrets reach a Trait: per-call release limited to declared
  providers, memory-only handling and redaction. Later changes add keychain storage and
  provider selection to this capability.

### Modified Capabilities

- `conversations`: replies are produced by Trait calls; the message events gain
  `message.progress`; stopping a reply also cancels its Trait call; sending is refused while
  the sidecar is not ready; replies in progress fail when the sidecar stops.

## Out of scope

- Real AI providers, API keys in the OS keychain, provider and model selection, and any cost
  to the user (change 3).
- Mini-Me definitions, the shared Trait library, Workflows and Steps, LangGraph, routing.
  The core still sends every user message to *Echo*.
- Asking the user for input during a call (approvals) and Interactive Component output: the
  protocol reserves names for them, nothing more.
- Traits that write Assets, and Traits supplied from outside the app bundle.
- OS-level sandboxing of the sidecar process, code execution, and code signing or notarizing
  the installers.
- Automatic retry of a Trait call after the sidecar restarts.

## Impact

- **Rust core (`src-tauri`)**: new modules for the sidecar process and supervisor, the link
  protocol, Trait calls and secrets; `echo.rs` is removed; new commands to read the sidecar
  status and to restart it.
- **Sidecar (`sidecar/`, new)**: the Python package with the link protocol, the Trait
  interface, the call runner and the *Echo* Trait.
- **Frontend (`src`)**: sidecar status display, composer disabled while the sidecar is not
  ready, progress line on streaming replies, `message.progress` in the event store.
- **Build and packaging**: a script that assembles the standalone Python and locked packages
  as Tauri resources before a release build. The installer grows by the size of the Python
  runtime (tens of megabytes).
- **Developer prerequisite**: `uv` on the developer's machine. Users need nothing extra.
- **New dependencies**: the `base64` Rust crate for Asset chunks; no runtime Python packages
  (the sidecar uses only the standard library in this change).
- **Files on the user's computer**: a sidecar log file in the app's log directory, never in
  a Project folder.
- **External services, credentials, costs**: none. The secret request is defined, but no
  secret source exists yet.
