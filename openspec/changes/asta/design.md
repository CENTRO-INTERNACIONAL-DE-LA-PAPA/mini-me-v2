# Design

## Context

- `allenai/asta-plugins` contains the `asta` Python package (v0.111.0, Apache-2.0):
  - `asta.literature.client.AstaPaperFinder(base_url, access_token).find_papers(query,
    timeout, operation_mode)` is a blocking request (urllib) returning ranked papers. Each
    paper has `title`, `authors`, `year`, `venue`, `url`, `corpusId`, `relevanceScore`,
    `relevanceJudgement` and `snippets`. The response also has an optional `narrative`.
  - `asta.theorizer` talks to the Theorizer over A2A: `asta.utils.a2a_stream.
    stream_a2a_message` yields status updates (`step_progress_of`), artifact updates
    (`artifact_data_of`) and a terminal status.
  - Base URLs come from the packaged `asta.conf` (gateway `asta-gateway.apps.allenai.org`).
    Auth0 is `auth0.allenai.org` with a public client ID and audience
    `https://asta-core.allen.ai`.
  - It depends on `asta-agent[a2a-client]`, `asta-artifact`, `click`, `rich`, `pyhocon`,
    `keyring`, `pydantic-settings` and `platformdirs`; `httpx`, `pydantic` and
    `cryptography` are already locked.
- The core's `KeychainSecrets` stores one string per key account, and `secret.get` returns
  it to adapters that declare the provider. Adapters that declare providers get a `model`.

## Goals / Non-Goals

**Goals:**
- The refresh token never leaves the Rust core.
- Asta's own token storage, CLI and config overrides stay unused, so Mini-Me controls
  where tokens live.

**Non-Goals:**
- Multi-turn Paper Finder or Theorizer sessions (A2A `context_id`).

## Decisions

### D1. Pinning `asta`

`uv add "asta @ git+https://github.com/allenai/asta-plugins@<commit>"` pins the package to
one commit, recorded in `uv.lock`. The first task checks that every dependency installs for
Python 3.14 on macOS and Windows (CI), and that importing `asta.literature.client` and
`asta.utils.a2a_stream` works without the CLI. Upgrading means changing the commit
deliberately.

### D2. Ai2 sign-in in the Rust core

A new `ai2` module owns the account:
- **`start_sign_in()`:** posts to `/oauth/device/code` with the client ID, audience and
  scopes `openid profile email offline_access access:all`, opens
  `verification_uri_complete` with the opener plugin, and returns `{ user_code,
  verification_uri }`.
- **Polling:** a background thread polls `/oauth/token` with the device code at the given
  interval until it gets tokens, `expired_token` or `access_denied`.
- **Storage:** tokens go to the keychain account `ai2` as JSON (`access_token`,
  `refresh_token`, `expires_at`, `email`). The email comes from `/userinfo`.
- **Status:** `ai2_status()` returns `{ state: signed_out | pending | signed_in, email,
  user_code, error }` and is published to the UI over a channel, like the update status.
- **`sign_out()`:** deletes the keychain entry.

The HTTP client is `reqwest` with `blocking` and `json`. It is already compiled as part of
`tauri-plugin-updater`, uses rustls (no system OpenSSL), and works on Windows, macOS and
Linux.

- *Alternative:* running Asta's `TokenManager` in the sidecar. Rejected: it would put the
  refresh token in the sidecar and in Asta's own keychain entry and file.

### D3. `secret.get` for `ai2`

`KeychainSecrets::get("ai2")` reads the JSON. Within five minutes of `expires_at`, it
refreshes through `/oauth/token` (`grant_type=refresh_token`), stores the rotated tokens
before returning, and returns only `access_token`. A failed refresh deletes nothing and
returns no secret, so the call fails with `secret_unavailable` ("Sign in to your Ai2 account
in Settings"). A mutex serializes refreshes, because rotated refresh tokens are single-use
and two calls must not refresh at once.

### D4. Adapters without a model

The Asta adapters declare provider `ai2`, but they do not run a chosen AI model.
`TraitCalls::start` currently gives a `model` to every adapter with providers and refuses
with `model_not_set` otherwise. The rule becomes: a call is allowed `secret.get` for a
provider when its adapter declares it and either the provider is the call's
`model.provider`, or it is a non-AI key account (`ai2`, `typesafe`). The model is required
only for adapters that declare an AI provider. `AdapterInfo` stays as it is; the
distinction comes from `secrets::is_provider`.

### D5. The adapters

- **`asta-paper-finder`:** gets the `ai2` token, then runs `find_papers(text,
  operation_mode="infer", timeout=300)` in `asyncio.to_thread`. It reports "Searching
  papers…" as progress. Once results arrive, it writes the reply as Markdown: a numbered
  list of `**Title** (year) — authors — venue — link`, with the relevance reason as an
  indented line below each, then "…and N more" past 20. The link is the paper's `url`, or
  `https://www.semanticscholar.org/p/<corpus_id>`. A real response carries, per paper,
  `corpus_id`, `title`, `abstract`, `year`, `authors` (names), `url`, `venue`,
  `relevance_score` and `relevant_snippets` (`text`, `section_title`), and no written
  relevance judgement. So the reason is the first relevant passage with its section,
  falling back to the abstract's first sentence. If `narrative` is present, it comes first. When the call is cancelled,
  the blocking request finishes in its thread and its result is discarded.
- **`asta-theorizer`:** gets the token and submits `{"kind":
  "literature-theory-generation", "data": {"theory_query": text}}` with `asta_agent`'s
  `A2AClient`. It then polls the task every 5 seconds, as Asta's CLI does. The skill is
  named explicitly, because other Theorizer skills take the same input. A run takes about
  3–8 minutes with the default 10 papers.
  - **Progress:** the Theorizer's status text, or "Got <artifact>" when a new artifact
    appears, plus the minutes elapsed, so a long "Accepted" doesn't look stuck.
  - **Result:** the final artifacts are rendered as Markdown. The first task records their
    shape from a real run.
  - **Stop:** stopping ends the polling. The run on Ai2's side is not cancelled, because
    the client has no cancel call.
- **Error mapping:** HTTP 401/403 → `ai2_auth`; connection errors, timeouts, 5xx and A2A
  `failed`/`rejected` states → `asta_unavailable`.

### D6. Library and Mini-Mes

`builtin.json` gains *Find Papers* (adapter `asta-paper-finder`) and *Theorize* (adapter
`asta-theorizer`), both without instructions. It also gains Researcher and Theorist, with
new IDs and colours from DESIGN.md's family:
- Researcher: tint `#FFE1D8`, solid `#FF5A36`, ink `#B3300F`;
- Theorist: tint `#FFF0C2`, solid `#F5B800`, ink `#7A5A00`.

### Process ownership

- **Rust core:**
  - the Ai2 account, tokens, refresh, user info and status;
  - the `secret.get` rule;
  - the library.
- **Sidecar:** calling Paper Finder and the Theorizer with the access token it is given,
  and shaping the replies.
- **UI:** the Settings row.

## Risks / Trade-offs

- [An Asta dependency lacks a Python 3.14 wheel for Windows] → the first task checks this,
  and the CI release build confirms it. The fallback is pinning an older dependency version.
- [Asta's API or response shape changes] → pinned to one commit; the adapters render
  defensively, skipping fields that are missing.
- [The Theorizer can run for many minutes] → progress keeps the user informed. The core's
  cancel timeout still applies when the user stops.
- [Auth0's device flow needs a browser] → it opens the system browser; the code is shown in
  the app too.
- [Queries go to Ai2] → stated in the README, and file contents are not sent.
