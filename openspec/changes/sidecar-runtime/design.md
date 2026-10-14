# Design

## Context

The Rust core (`src-tauri`) already persists every Conversation event before delivering it
(`ProjectState::persist`) and produces replies through `conversations::start_reply`,
`append_delta`, `complete_reply` and `fail_reply`. Today the only producer is `echo.rs`, a
thread that streams the user's text back. `stop_reply` persists `message.cancelled`, and the
producer notices because its next delta is rejected. Concurrency is plain `std::thread`; there
is no async runtime in the core. There is no `sidecar/` folder yet. `uv` 0.12 is available on
the development machine.

See proposal.md for motivation and the specs in this change for the required behavior.

Ownership in this change:
- **Rust core:** process start, supervision, handshake, status, Trait call bookkeeping,
  translating call frames into persisted events, Asset reads, secrets, the sidecar log. All
  durable state stays here.
- **Sidecar:** the link loop, Trait discovery, running calls, the per-call error boundary,
  progress throttling, cancellation signals. No durable state, no file access.
- **UI:** shows sidecar status, disables the composer when the sidecar is not ready, shows
  reply progress.

## Goals / Non-Goals

**Goals:**
- A link protocol and Trait interface that the Traits on the roadmap can use without a
  protocol version bump.
- A release build that runs on a clean Windows, macOS or Linux machine.
- Supervision that a test can drive end to end against the real sidecar.

**Non-Goals:**
- Performance tuning of the link (binary framing, compression).
- A Python test suite (see D13).
- Hot reload of the sidecar during development.

## Decisions

### D1. Link frames are not Conversation events
The link carries **frames** (`{ "type": ..., ...payload fields }`), not envelope events. The
Rust core is the only producer of envelope events: it owns IDs, `seq`, `ts` and `origin`, and
translates call frames into `message.*` events for the reply (spec: Trait call outcomes map to
message events). The sidecar never sees message IDs or sequence numbers.
- *Alternative:* the sidecar emits partial envelope events (`type` + `payload`) that the core
  completes. Rejected: the sidecar would need to know message IDs, and the core would still
  have to validate every event kind it accepts, so it saves no work and blurs ownership.
- Frame fields sit at the top level next to `type` (for example
  `{"type":"call.delta","call_id":"…","text":"lo"}`). `protocol/fixtures/sidecar-frames.json`
  holds one example of every frame type, checked by a Rust round-trip test, like the existing
  event fixture.

### D2. Process model and threads in the core
One sidecar process per app, started in the Tauri `setup` hook, shared by all open Projects.
The core uses threads, matching the existing code:
- a **reader** thread parses stdout lines and dispatches frames;
- a **writer** behind a mutex on the child's stdin, flushing after every line;
- a **stderr** thread copying lines to the sidecar log;
- a **supervisor** thread owning the state machine
  (`starting → ready → restarting → … → stopped | incompatible`), the `ping` timer and the
  backoff.

The supervisor publishes `SidecarStatus { state, detail, protocol, sidecar_version }` to
subscribers. Restart delays after the 1st to 4th consecutive failure: 0.5 s, 1 s, 2 s, 4 s;
the 5th stops the retries (spec: Restart with backoff). The failure count resets after 60 s
in `ready`. Ping every 10 s with a 20 s response timeout. Start timeout: 20 s in
release, 120 s in development (the first `uv run` may need to create the environment).
- *Alternative:* add `tokio` for the supervisor. Rejected: one process and a handful of
  threads do not need an async runtime, and mixing one into the existing thread-based code
  adds more than it saves.
- *Alternative:* one sidecar per Project. Rejected: more memory and start time, and
  confinement is enforced in the core per call anyway.

### D3. Status is app state, not a Conversation event
Sidecar status is not tied to a Project or Conversation and does not need to be replayed, so
it is not an envelope event. The UI reads it with `get_sidecar_status` and follows changes
through `subscribe_sidecar_status(channel)`, the same Tauri channel mechanism the
Conversation stream uses. `restart_sidecar` implements the manual retry.

### D4. Trait calls in the core
A `TraitCalls` registry maps `call_id` to `{ project: Arc<Project>, message_id, trait_id,
state }`. `send_message`, after persisting the user message, calls `start_reply` and sends
`call.start` with *Echo*. The reader thread routes each call frame to the registry, which
calls the existing `conversations` reply functions. Those already reject updates to a reply
that is no longer streaming, so frames that race a stop, or arrive late, are dropped by the
same rule the echo responder relied on.
- `stop_reply` keeps persisting `message.cancelled` immediately (the user sees "stopped" at
  once), then asks the registry to send `call.cancel` for that message's call. A 5 s timer
  closes the call if the sidecar does not answer.
- When the process stops, the supervisor tells the registry, which fails every open call's
  reply with `sidecar_stopped` and clears the registry before the restart.
- `send_message` checks the status before persisting anything and returns
  `sidecar_unavailable` when it is not `ready`.

### D5. Sidecar structure and the Trait adapter interface
`sidecar/` is a `uv` project with the package `mini_me_sidecar`:
- `link.py`: line reader/writer on the reserved protocol stream, frame dispatch.
- `runner.py`: one `asyncio` task per call, the per-call error boundary, cancellation,
  progress throttling (at most one frame per 250 ms per call, latest wins).
- `traits/base.py`: the adapter interface. A Trait is a class with `info: TraitInfo` and
  `async def run(self, ctx: CallContext, input: dict) -> None`. `CallContext` offers
  `write(text)`, `progress(label, fraction=None)`, `cancelled` (an `asyncio.Event`),
  `await read_asset(asset_id)` and `await secret(provider)`. This is the only surface Traits
  see; provider specifics (LangGraph, Asta, provider SDKs) stay inside each Trait's adapter.
- `traits/echo.py`: *Echo*.
- `traits/testing.py`: Traits used only by the Rust tests (fail, hang, ignore cancellation,
  read an Asset, use the dummy secret, exit the process), registered only when the sidecar is
  started with `--test-traits`.

The event loop must stay free to answer `ping`, so Traits run blocking work through
`asyncio.to_thread`. Cancellation sets `ctx.cancelled` and, if the Trait has not returned
after a short grace period, cancels its task. A Trait that ignores both keeps running in the
background, but the core has already closed the call (spec: Trait ignores cancellation).
- *Alternative:* a thread per call. Rejected: cancellation and concurrent requests are
  simpler with `asyncio`, and the SDKs the later Traits use are async.

### D6. Reserving stdout for the link
At startup, before importing anything else, the sidecar duplicates file descriptor 1 into a
private descriptor used only by the link, then points descriptor 1 at descriptor 2. Python's
`sys.stdout` is rebound to stderr. This catches output from native libraries, which write to
descriptor 1 directly rather than through `sys.stdout`. The link is opened in binary mode and
encodes UTF-8 explicitly, so the Windows console code page never applies. When stdin reaches
EOF the sidecar exits, which covers a Rust core that died (spec: Sidecar ends with the app).

### D7. Launch: development and release
- **Pinning:** `sidecar/.python-version` holds the exact patch (`3.14.7`), set when the
  first release bundle is built, so every release bundles the same Python build;
  `pyproject.toml` has `requires-python = "==3.14.*"`; `uv.lock` is committed.
- **Development** (`cfg(debug_assertions)`): `uv run --frozen --project <repo>/sidecar
  python -I -m mini_me_sidecar`, with the repository path from `CARGO_MANIFEST_DIR`.
  `--frozen` uses the lockfile as is and never rewrites it.
- **Release:** `npm run tauri:release` builds with `src-tauri/tauri.release.conf.json`
  merged in. That file alone adds the `bundle-sidecar` step to `beforeBuildCommand` and the
  `resources/sidecar/**/*` resources, because Tauri checks resource paths on every build and
  development builds would fail without a bundled sidecar. `sidecar/scripts/bundle.py`:
  1. `uv python install <pinned> --install-dir` into a build folder, which gives a
     python-build-standalone runtime;
  2. copies it to `src-tauri/resources/sidecar/python/`, without unused stdlib parts;
  3. `uv export --frozen --no-dev`, then `uv pip install --target
     src-tauri/resources/sidecar/packages` for the locked dependencies (skipped when there
     are none), and copies the pure-Python `mini_me_sidecar` package next to them;
  4. writes `src-tauri/resources/sidecar/launch.py`.

  Tauri bundles that folder as a resource. The core starts
  `<resources>/sidecar/python/<interpreter> -I <resources>/sidecar/launch.py`. `-I`
  (isolated mode) ignores `PYTHON*` environment variables and user site-packages, and
  `launch.py` puts `packages/` on `sys.path` explicitly. `src-tauri/resources/` is
  git-ignored.
- *Alternative:* PyInstaller or Nuitka into a single executable. Rejected: self-extracting
  executables are a frequent antivirus false positive, startup is slower, and native packages
  (numpy, later) need per-package hooks.
- *Alternative:* require the user to install Python. Rejected by the architecture rules.

### D8. Handshake and version reporting
`SIDECAR_PROTOCOL` is `1` on both sides (a Rust constant and a Python constant). The core
waits for `hello`. On a mismatch it builds the detail text from both numbers. In debug builds
it adds which side is stale: the lower number, since protocol versions only increase. The
supervisor then moves to `incompatible` and never restarts. After a match it sends
`traits.list` and enters `ready` once `traits` arrives.

### D9. Requests from the sidecar
`core.request` frames are handled on a small worker pool so that a slow Asset read does not
block the reader thread. `asset.read` looks up the call's Project in the registry, resolves the
Asset with `assets::file_path`, which goes through `ProjectPaths::resolve`, and reads at most
1 MiB from `offset`. Asset IDs from another Project are not in this Project's table and
return `not_found`. The sidecar never receives a path. It is not OS-sandboxed (out of scope);
confinement holds because the shipped sidecar code has no file access of its own and gets
Project data only through these requests.

### D10. Secrets
- **Rust:** `Secret(String)` whose `Debug` and `Display` print `[redacted]` and which is
  not `Serialize` except through the one response builder. A `SecretSource` trait has the
  implementation `NoSecrets` (always `secret_unavailable`) in the app and an in-memory one in
  tests.
- `secret.get` checks that the call is active and the provider is in the Trait's declared
  `providers` before asking the source.
- **Frame logging:** off by default, on with `MINI_ME_LOG_FRAMES=1`. It runs every frame
  through a redactor that replaces `value` in `secret.get` responses (matched by
  `request_id`) with `[redacted]`.
- **Python:** `Secret` with a redacting `__repr__`/`__str__`. `CallContext.secret()` returns
  it, and the link logger uses the same redaction rule.
- Change 3 plugs the OS keychain in as a new `SecretSource`, with no protocol change.

### D11. Sidecar log
`<app log dir>/sidecar.log`. It is rotated once at 5 MB, keeping one previous file
(`sidecar.log.1`), and holds stderr lines plus supervisor diagnostics (start, exit code,
restarts, version mismatch). The core writes it; the sidecar only writes stderr.

### D12. UI
- `api.getSidecarStatus` / `api.subscribeSidecarStatus` / `api.restartSidecar`.
- A status line at the bottom of the Project sidebar and the Project picker: hidden when
  `ready`; otherwise it shows the detail, with "Try again" when `stopped`.
- The composer is disabled with the detail as its hint when the status is not `ready`.
- `eventStore` keeps `progress` per message from `message.progress` and clears it when the
  message ends. `MessageItem` shows it under a streaming reply.
- `message.progress` is added to `src/protocol/types.ts`, `protocol.rs` and the event
  fixture.

### D13. Tests
Following the project's testing rule (Rust unit tests and frontend tests only), there is no
pytest suite yet. Sidecar behavior is covered by Rust tests:
- Unit tests against an in-memory fake link: frame round-trips, call-frame → event mapping,
  cancellation timeout, `sidecar_stopped` on exit, secret allow/deny/redaction, Asset chunking
  and confinement, the backoff schedule, the mismatch message.
- A few tests that start the **real** sidecar through `uv run` with `--test-traits`:
  handshake, *Echo* streaming, cancellation, error boundary, crash and restart. They are
  marked `#[ignore]` so plain `cargo test` stays fast; the user runs them with
  `cargo test -- --include-ignored`.

### Dependencies
- `base64` (Rust, pure Rust, all platforms): encodes Asset chunks. Small and widely used;
  hand-rolling base64 is not worth it.
- **Sidecar runtime:** no third-party packages; standard library only (`asyncio`, `json`).
- **Build time only:** `uv` (developer machine) and python-build-standalone, which `uv`
  downloads. Both support Windows, macOS and Linux. Users install nothing.

## Risks / Trade-offs

- **[Risk, observed]** On the development machine, OfficeScan (Trend Micro) Behaviour
  Monitoring blocks `uv python list` and the Python processes it starts, even when the user
  runs it. If CIP-managed machines share that policy, the sidecar may be blocked for users
  too. → Mitigation: CIP IT allowlists the bundled interpreter by path
  (`%LOCALAPPDATA%\<app name>\sidecar\python\python.exe` for a per-user install). The path
  stays the same across updates, so the app name must be final before the first release.
  Code signing is out of reach. Running Python in process (PyO3) stays a fallback, at the
  cost of the three-process architecture.
- **[Risk]** Antivirus quarantines or blocks the bundled `python.exe` (unsigned). →
  Mitigation: detected early by the release check in tasks. The error surfaces as `stopped`
  with the log pointing at the start failure. Code signing the installer is a follow-up.
- **[Risk]** Installer size grows by roughly 30–60 MB for the runtime. → Accepted; it is the
  cost of no prerequisites. Unused stdlib parts (tests, tkinter, idle) are removed by the
  bundle script.
- **[Risk]** A Trait blocks the event loop and pings time out, restarting the sidecar and
  failing other calls. → Mitigation: the interface tells Traits to use `asyncio.to_thread`, and
  the 20 s ping timeout tolerates short stalls.
- **[Risk]** `uv run` in development starts slowly the first time. → The 120 s development
  start timeout covers it. The tasks have developers run `uv sync` once.
- **[Trade-off]** Every `progress` update is persisted as an event. → Throttled to 4 per
  second per call. Acceptable for now; compaction is a later concern.
- **[Trade-off]** Calls are not retried after a crash. → Retrying could repeat costly or
  side-effecting work. The user resends instead.

## Migration Plan

No data migration: `message.progress` is a new event type, and older app versions already
ignore unknown types. `echo.rs` is deleted once the *Echo* Trait answers messages. Replies
streaming when the app closes are still marked `interrupted` on open, as before.
