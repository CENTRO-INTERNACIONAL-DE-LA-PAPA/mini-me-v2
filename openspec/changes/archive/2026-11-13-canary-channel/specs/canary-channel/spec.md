# Spec Delta

## Purpose

Defines Mini-Me Canary, the app that development and beta testing run as: its own identity and
data, kept apart from the installed Mini-Me, and how its builds are versioned, published from
`dev` and delivered to installed copies.

## ADDED Requirements

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

### Requirement: Canary builds are named by their commit
A Canary build SHALL be named after the commit it was built from, by the first 7 characters of
its hash: its pre-release SHALL be named "Mini-Me Canary <hash>" and tagged `canary-<hash>` at
that commit, and the app SHALL show that name in Settings → About. A Canary build SHALL NOT
carry a Mini-Me release's version. A commit that already has a Canary build SHALL NOT be built
again.

#### Scenario: A build
- **WHEN** a Canary build is made from commit `a1b2c3d`
- **THEN** the pre-release "Mini-Me Canary a1b2c3d" is tagged `canary-a1b2c3d`, and the installed
  app shows "Mini-Me Canary a1b2c3d" in Settings → About

#### Scenario: The same commit again
- **WHEN** the maintainer starts a Canary build by hand while `canary-a1b2c3d` exists for the
  newest commit of `dev`
- **THEN** nothing is built

#### Scenario: Running from source
- **WHEN** the developer runs `npm run tauri:dev`
- **THEN** Settings → About shows "Mini-Me Canary (local)"

### Requirement: Canary builds are ordered
Each Canary build SHALL be newer, to an installed Mini-Me Canary, than every build made before
it, whatever their hashes. The order SHALL come from a build number that rises by one with every
build and appears only in the installers' file names, as `0.0.<number>`.

#### Scenario: The next build
- **WHEN** build 42 was made from `a1b2c3d` and another change reaches `dev` as `9f8e7d6`
- **THEN** build 43 is made from it, and installed copies of "Mini-Me Canary a1b2c3d" treat
  "Mini-Me Canary 9f8e7d6" as newer

### Requirement: Mini-Me Canary updates itself from Canary builds
An installed Mini-Me Canary SHALL check for a newer published Canary build when it starts and
every 4 hours while it is open, and SHALL download, verify and install it as the `app-updates`
spec defines for Mini-Me. It SHALL never be offered or install a Mini-Me release. Mini-Me
Canary run from the source tree SHALL NOT check.

#### Scenario: A newer Canary build
- **WHEN** Mini-Me Canary a1b2c3d is open and the next build, 9f8e7d6, is published
- **THEN** it downloads Mini-Me Canary 9f8e7d6 and offers to restart

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
- **WHEN** Mini-Me 0.7.0 checks for updates while the newest pre-release is Mini-Me Canary a1b2c3d
- **THEN** it reports no update

### Requirement: Stable bundled Python path in Mini-Me Canary
On Windows, Mini-Me Canary's bundled Python executable SHALL be at
`%LOCALAPPDATA%\Mini-Me Canary\sidecar\python\python.exe` for every Canary build, so an IT
allowlist entry by path keeps working across updates.

#### Scenario: Path after an update
- **WHEN** Mini-Me Canary is updated from one build to the next on Windows
- **THEN** the sidecar is started from the same `python.exe` path as before
