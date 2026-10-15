# Tasks

Builds and tests are run by the user (see CLAUDE.md); a task is done when their run confirms
it.

## 1. Asta package

- [ ] 1.1 Pin `asta` from `allenai/asta-plugins` to one commit with `uv add` in `sidecar/` (D1); verify `uv.lock` resolves for Python 3.14, `.venv/bin/python -I -c "import asta.literature.client, asta.utils.a2a_stream"` works, and `npm run bundle-sidecar` includes it
- [ ] 1.2 With a signed-in Ai2 token, run one Paper Finder search and one Theorizer request from the sidecar's Python and record in design D5 which fields hold the relevance reason and how the Theorizer's artifact is shaped; verify the notes match the real responses

## 2. Ai2 account (Rust core)

- [ ] 2.1 Add the `ai2` module with the device flow, polling, user info, keychain storage, status and sign-out, plus the `ai2` key account (D2); verify with unit tests on the token JSON round-trip and the status transitions, and `cargo test` passes
- [ ] 2.2 Refresh in `secret.get` for `ai2` with the mutex, and allow non-AI key accounts without a model (D3, D4); verify with unit tests that an expiring token is refreshed through a fake token endpoint, that a failed refresh gives `secret_unavailable`, and that an adapter declaring only `ai2` starts without a model
- [ ] 2.3 Add the `ai2_start_sign_in`, `subscribe_ai2_status` and `ai2_sign_out` commands and the "Ai2 account" row in Settings; verify manually that signing in, a restart and signing out behave as the "Signing in to an Ai2 account" scenarios say

## 3. Adapters and Mini-Mes

- [ ] 3.1 Implement `asta-paper-finder` (D5); verify by asking Researcher for papers on a topic in `npm run tauri dev` and getting a numbered list with links and relevance
- [ ] 3.2 Implement `asta-theorizer` (D5); verify that Theorist shows progress steps and ends with theories and evidence, and that Stop ends it as stopped
- [ ] 3.3 Add *Find Papers*, *Theorize*, Researcher and Theorist to `builtin.json` (D6); verify the library tests pass and both Mini-Mes are offered after `@`

## 4. Docs and integration

- [ ] 4.1 Update the README: the Ai2 account in "Setting up an AI provider", Researcher and Theorist in "Asking a Mini-Me", *Find Papers* and *Theorize* notes in the Traits table, and what is sent to Ai2; show the diff to the user before committing
- [ ] 4.2 Run `cargo test`, `cargo test -- --include-ignored` and `npm test` and confirm all pass

## Workflow follow-up

- Archive the change (`/opsx:archive`), syncing its specs into `openspec/specs/`.
- Merge rows 7 and 8 of the README Roadmap into "Asta integration and Traits" (Done),
  renumber the rows after it, mark the next one "Next", and show the diff before committing.
