# canary-channel Specification

## Purpose
Defines Mini-Me Canary, the app that development and beta testing run as: its own identity and
data, kept apart from the installed Mini-Me, and how its builds are versioned, published from
`dev` and delivered to installed copies.

## Requirements

### Requirement: Mini-Me Canary is a separate app
Mini-Me Canary SHALL be built from the same code as Mini-Me, with the identifier
`org.cipotato.mini-me.canary`, the name "Mini-Me Canary" and the Canary icon, so it can run
next to an installed Mini-Me without affecting it.

#### Scenario: Both running
- **WHEN** Mini-Me is installed and open, and the user starts Mini-Me Canary
- **THEN** both run at once, each with its own name and icon

### Requirement: Mini-Me Canary keeps its own data
Mini-Me Canary SHALL keep its Projects in `Mini-Me Data (Canary)` in the Documents folder, and
its settings, logs and keychain entries under its own identifier. It SHALL NOT read or write
Mini-Me's `Mini-Me Data` folder, settings, logs or keychain entries. Every Trait run SHALL stay
confined to its Project folder inside `Mini-Me Data (Canary)`.

#### Scenario: Schema upgrade in Mini-Me Canary
- **WHEN** a Mini-Me Canary build upgrades the database schema of the Projects it opens
- **THEN** Mini-Me's Projects are unchanged and Mini-Me still opens them

#### Scenario: Keys are separate
- **WHEN** the user saves an OpenAI key in Mini-Me Canary
- **THEN** Mini-Me's Settings do not show an OpenAI key unless one was saved there

### Requirement: Local runs are Mini-Me Canary
Running the app from the source tree for development (`npm run tauri:dev`) SHALL run it as
Mini-Me Canary, with Mini-Me Canary's data, settings and keychain entries.

#### Scenario: Developing next to the installed app
- **WHEN** the developer runs `npm run tauri:dev` while Mini-Me is installed
- **THEN** the running app is titled "Mini-Me Canary" and shows Mini-Me Canary's Projects, not
  Mini-Me's

### Requirement: Canary builds are published from dev
A Canary build SHALL be made when `dev` receives a push that changes a file other than a
Markdown file or a file under `docs/` or `openspec/`, and when the maintainer starts one by
hand. It SHALL build Mini-Me Canary for the platforms a Mini-Me release has, and publish them
as one GitHub pre-release, without a manual step, only when every platform built.

#### Scenario: A change merged into dev
- **WHEN** a pull request that changes the Rust core is merged into `dev`
- **THEN** a pre-release appears on GitHub with Mini-Me Canary's Windows, macOS and Linux
  installers and their update files

#### Scenario: A documentation push
- **WHEN** a commit that changes only `README.md` and `docs/development.md` is pushed to `dev`
- **THEN** no Canary build is made

#### Scenario: One platform fails
- **WHEN** the macOS build of a Canary build fails
- **THEN** nothing is published, and installed copies are still offered the previous build

#### Scenario: A newer change during a build
- **WHEN** a second change reaches `dev` while the first is still building
- **THEN** the first build is stopped and its draft deleted, and only the second is published

### Requirement: Mini-Me Canary updates itself from Canary builds
An installed Mini-Me Canary SHALL check for a newer published Canary build when it starts and
every 4 hours while it is open, and SHALL download, verify and install it as the `app-updates`
spec defines for Mini-Me. It SHALL never be offered or install a Mini-Me release. Mini-Me
Canary run from the source tree SHALL NOT check.

#### Scenario: A newer Canary build
- **WHEN** Mini-Me 0.8.1-canary.1 is open and the next build, 0.8.1-canary.2, is published
- **THEN** it downloads Mini-Me 0.8.1-canary.2 and offers to restart

#### Scenario: A new Mini-Me release
- **WHEN** Mini-Me 0.8.0 is published while Mini-Me Canary is running
- **THEN** Mini-Me Canary shows no update for it

#### Scenario: Running from source
- **WHEN** the developer runs `npm run tauri:dev` while a newer Canary build is published
- **THEN** no update is downloaded or offered

### Requirement: Canary builds never reach Mini-Me
A Canary pre-release SHALL NOT be offered to Mini-Me and SHALL NOT become GitHub's latest
release.

#### Scenario: Mini-Me checks for updates
- **WHEN** Mini-Me 0.7.0 checks for updates while the newest pre-release is Mini-Me
  0.8.1-canary.1
- **THEN** it reports no update

### Requirement: Stable bundled Python path in Mini-Me Canary
On Windows, Mini-Me Canary's bundled Python executable SHALL be at
`%LOCALAPPDATA%\Mini-Me Canary\sidecar\python\python.exe` for every Canary build, so an IT
allowlist entry by path keeps working across updates.

#### Scenario: Path after an update
- **WHEN** Mini-Me Canary is updated from one build to the next on Windows
- **THEN** the sidecar is started from the same `python.exe` path as before
### Requirement: Canary builds are named after the version on dev
A Canary build SHALL be named after the version in `package.json` at its commit and a counter
`<n>`, one above the highest published Canary build of that version, or 1 if there is none: its
pre-release SHALL be tagged `v<version>-canary.<n>` at that commit and named "Mini-Me
<version>-canary.<n>", and its notes SHALL name the commit. A commit that already has a
published Canary build SHALL NOT be built again.

#### Scenario: A build
- **WHEN** `package.json` on `dev` says 0.8.1, Mini-Me 0.8.1-canary.1 is published, and a
  change reaches `dev` as `9f8e7d6`
- **THEN** the pre-release "Mini-Me 0.8.1-canary.2" is tagged `v0.8.1-canary.2` at `9f8e7d6`,
  and its notes name `9f8e7d6`

#### Scenario: After a bump
- **WHEN** Mini-Me 0.8.1-canary.4 is published and the version on `dev` is bumped to 0.8.2
- **THEN** the next build is Mini-Me 0.8.2-canary.1

#### Scenario: The same commit again
- **WHEN** the maintainer starts a Canary build by hand while `v0.8.1-canary.2` is published at
  the newest commit of `dev`
- **THEN** nothing is built

#### Scenario: A build that was stopped
- **WHEN** a build of 0.8.1-canary.3 is stopped by a newer change before it was published
- **THEN** its draft is deleted, and the newer change is built as 0.8.1-canary.3

### Requirement: A released version gets no Canary build
When the version in `package.json` at the commit already has a Mini-Me release, tagged
`v<version>`, no Canary build SHALL be made, and the workflow run SHALL fail with a message
saying that version is released and the version on `dev` must be bumped.

#### Scenario: Not bumped after a release
- **WHEN** Mini-Me 0.7.0 is released, `package.json` on `dev` still says 0.7.0, and a change
  reaches `dev`
- **THEN** no Canary build is made, and the run fails saying 0.7.0 is released and the version
  on `dev` must be bumped

#### Scenario: Bumped
- **WHEN** the version on `dev` is then bumped to 0.7.1
- **THEN** the next change to `dev` is built as Mini-Me 0.7.1-canary.1

### Requirement: Canary builds are ordered by version and counter
A Canary build's app version SHALL be `<version>-canary.<n>`, so each build is newer, to an
installed Mini-Me Canary, than every earlier build of the same version and every build of a
lower version. Installed copies whose version is `0.0.<number>` SHALL treat the first build named
after a version as newer.

#### Scenario: A fix without a bump
- **WHEN** Mini-Me 0.8.1-canary.9 is installed and 0.8.1-canary.10 is published
- **THEN** the installed copy treats 0.8.1-canary.10 as newer

#### Scenario: An older build number
- **WHEN** a copy built as version `0.0.42` is installed and 0.8.1-canary.1 is published
- **THEN** the installed copy updates to 0.8.1-canary.1

### Requirement: Settings shows a Canary build's name
Settings → About SHALL show a Canary build as "Mini-Me <version>-canary.<n>", the name of its
pre-release, and Mini-Me Canary run from the source tree as "Mini-Me Canary (local)".

#### Scenario: An installed build
- **WHEN** Mini-Me 0.8.1-canary.2 is installed and the user opens Settings → About
- **THEN** it shows "Mini-Me 0.8.1-canary.2"

#### Scenario: Running from source
- **WHEN** the developer runs `npm run tauri:dev`
- **THEN** Settings → About shows "Mini-Me Canary (local)"

### Requirement: Stale canary drafts are deleted
Before a Canary build is drafted, every draft pre-release whose tag starts with `v` and contains
`-canary.` SHALL be deleted, and no other draft SHALL be. A Mini-Me release build SHALL delete
only its own stale drafts, never a Canary build's.

#### Scenario: A release draft
- **WHEN** a draft for Mini-Me 0.8.0 from a failed release build exists and a Canary build starts
- **THEN** that draft is kept

#### Scenario: A release during a Canary build
- **WHEN** Mini-Me 0.8.1-canary.3 is building and a change to `main` starts a release build
- **THEN** the Canary build's draft is kept, and it is published once every platform built
