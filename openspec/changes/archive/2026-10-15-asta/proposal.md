# Proposal

## Why

Two of the Traits CIP scientists most expect, *Find Papers* and *Theorize*, are services
Ai2 already runs as part of Asta: Paper Finder searches full-text literature, and the
Theorizer builds theories from it. Mini-Me can offer both once it can sign in to an Ai2
account and call Asta from the sidecar. This merges the roadmap's "Asta integration" and
"Asta Traits" changes, since they share the package, the sign-in and the adapters.

## What Changes

- **Asta package:** `asta` from `allenai/asta-plugins`, pinned to one commit as a git
  dependency of the sidecar. It is not on PyPI; the `asta` package there is unrelated.
  Mini-Me calls its Paper Finder and Theorizer clients as a library and does not use its
  CLI, skills or token storage.
- **Ai2 account in Settings:** "Sign in" starts Auth0's device flow. Mini-Me opens the Ai2
  sign-in page in the browser and shows the code to confirm. The row then reads "Signed in
  as …" with "Sign out". The Rust core stores the tokens in the OS keychain, refreshes
  them, and gives adapters only a current access token through `secret.get` (provider
  `ai2`).
- **Two Traits, each with its own adapter:**
  - ***Find Papers*** (adapter `asta-paper-finder`): sends the message to Paper Finder and
    replies with a ranked list of papers, each with title, authors, year, venue, link and
    why it is relevant.
  - ***Theorize*** (adapter `asta-theorizer`): sends the message to the Theorizer, shows
    each step as progress, and replies with the theories and their supporting evidence.
- **Two predefined Mini-Mes:** **Researcher** runs *Find Papers*, and **Theorist** runs
  *Theorize*. Jev picks them from their descriptions like the others.

## Capabilities

### New Capabilities

- `asta`: the Ai2 account (sign-in, tokens, sign-out) and the *Find Papers* and *Theorize*
  adapters.

### Modified Capabilities

- `mini-mes`: the library gains *Find Papers* and *Theorize*, and the predefined Mini-Mes
  gain Researcher and Theorist.

## Impact

- **Sidecar:** the `asta` dependency (its own dependencies are mostly already in `uv.lock`)
  and two adapters.
- **Rust core:** an `ai2` module for the device flow, token refresh and user info, which
  uses an HTTP client (`reqwest`, already in the dependency tree through the updater). It
  also adds Settings commands, the `ai2` key account, and the library entries.
- **UI:** the "Ai2 account" row in Settings.
- **External service:** Ai2's Asta gateway and Auth0 (`auth0.allenai.org`). The text of
  messages answered by Researcher or Theorist is sent to Ai2. No file contents are sent.
  Paper Finder and the Theorizer are treated as free; Asta's documentation only mentions
  credits for AutoDiscovery, which is not part of this change.
- **Credentials:** the Ai2 tokens, in the OS keychain.

## Out of scope

- AutoDiscovery, data analysis, PDF extraction, the local document library, and Semantic
  Scholar tools.
- The confirmation before actions that cost extra; it comes with the first such action
  (AutoDiscovery).
- Multi-turn Paper Finder sessions (`literature interactive`).
