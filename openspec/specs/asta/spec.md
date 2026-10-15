# asta Specification

## Purpose

Defines how Mini-Me uses Ai2's Asta: signing in to an Ai2 account, keeping its tokens, and
the adapters that run the Asta-based Traits *Find Papers* and *Theorize*.

## Requirements

### Requirement: Signing in to an Ai2 account
Settings SHALL have an "Ai2 account" row. "Sign in" SHALL start Auth0's device flow
(`auth0.allenai.org`, the Asta client ID and audience), open the verification page in the
browser, and show the user code until the user confirms or the code expires. Once signed in,
the row SHALL show the account's name or email and offer "Sign out".

#### Scenario: Signing in
- **WHEN** the user clicks "Sign in" and confirms the code on the Ai2 page
- **THEN** the row shows "Signed in as" the account's email, without restarting Mini-Me

#### Scenario: Code expires
- **WHEN** the user does not confirm the code before it expires
- **THEN** the row says the sign-in timed out and offers "Sign in" again

### Requirement: Ai2 tokens stay in the core
The Rust core SHALL store the Ai2 access and refresh tokens in the OS keychain under the
account `ai2`, and SHALL refresh the access token when it is within five minutes of expiring.
The sidecar SHALL receive only a current access token, through `secret.get` with provider
`ai2`, and only for adapters that declare `ai2`. "Sign out" SHALL delete the tokens.

#### Scenario: Expired access token
- **WHEN** Researcher runs and the stored access token has expired
- **THEN** the core refreshes it and returns the new access token, and the rotated refresh
  token replaces the old one in the keychain

#### Scenario: Not signed in
- **WHEN** no Ai2 account is signed in and the user asks Researcher something
- **THEN** the reply fails with code `secret_unavailable` and says to sign in to an Ai2
  account in Settings

### Requirement: Find Papers adapter
The sidecar's `asta-paper-finder` adapter SHALL declare provider `ai2`. It SHALL send the
call's input text to Asta's Paper Finder and reply with the found papers in relevance order.
Each paper SHALL be shown with title, authors (the first three, then "et al."), year, venue
when known, a link, and why it is relevant. At most 20 papers are listed; the reply says how
many more there were.

#### Scenario: Search
- **WHEN** the user sends "@Researcher late blight resistance genes in wild potato"
- **THEN** Researcher replies with a numbered list of papers, each with its title, authors,
  year, link and relevance

#### Scenario: Nothing found
- **WHEN** Paper Finder returns no papers
- **THEN** the reply says no papers were found and suggests rephrasing

### Requirement: Theorize adapter
The sidecar's `asta-theorizer` adapter SHALL declare provider `ai2`. It SHALL send the
call's input text to Asta's Theorizer, report each of its steps as progress, and reply with
the theories it returns and the evidence it gives for each.

#### Scenario: Theories
- **WHEN** the user sends "@Theorist why do some potato varieties tolerate drought better?"
- **THEN** the reply shows the Theorizer's steps as progress while it works and ends with
  the theories and their evidence

### Requirement: Asta errors are actionable
The Asta adapters SHALL end failed calls with:
- `ai2_auth` when Ai2 rejects the token;
- `asta_unavailable` when the service cannot be reached, fails or times out.

Each comes with a message the user can act on, and stopping a reply SHALL end the call as
cancelled.

#### Scenario: Rejected token
- **WHEN** Ai2 rejects the access token
- **THEN** the reply fails with `ai2_auth` and says to sign in to the Ai2 account again in
  Settings

### Requirement: What is sent to Ai2
The Asta adapters SHALL send Ai2 only the call's input text (the message without mentions)
and the access token. No file content, earlier message or other key SHALL be sent.

#### Scenario: Referenced file
- **WHEN** the user sends "@Researcher papers like #notes.txt"
- **THEN** Paper Finder receives the text "papers like #notes.txt" and not the file's
  content
