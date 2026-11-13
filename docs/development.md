# Developing Mini-Me

[architecture.md](architecture.md) explains how the UI, the Rust core and the Python
sidecar work together, and how to add Traits, adapters and Interactive Components.
Specifications and planned changes live in [`openspec/`](../openspec/); the project-wide
glossary, architecture rules and conventions are in
[`openspec/config.yaml`](../openspec/config.yaml).

## Running the app

Requirements: [Node.js](https://nodejs.org), [Rust](https://rustup.rs), the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS, and
[uv](https://docs.astral.sh/uv/) for the Python sidecar. Users of the installed app need none
of these: release builds bundle their own Python.

```bash
npm install
cd sidecar && uv sync --frozen && cd ..   # once, and after the sidecar's dependencies change
npm run tauri:dev
```

`tauri:dev` runs the app as **Mini-Me Canary** (`src-tauri/tauri.canary.conf.json`): the
identifier `org.cipotato.mini-me.canary`, the Canary icon and its own data. Its Projects
are in `Documents/Mini-Me Data (Canary)`, and its settings, logs and keychain entries are kept
under its identifier, so development never touches the installed Mini-Me's Projects or keys.
Set up its API keys and Ai2 sign-in once in Mini-Me Canary's Settings.

In development the app starts the sidecar from `sidecar/` with `uv run`. Its log is
`sidecar.log` in the app's log directory; set `MINI_ME_LOG_FRAMES=1` to also log every frame
of the link (secrets are redacted).

Release build, with the standalone Python and the sidecar bundled into the installer:

```bash
npm run tauri:release
```

Local release builds produce no update files and need no signing key, and a local build
does not update itself.

A release build also writes `src-tauri/resources/third-party.json` with `npm run third-party`
([`scripts/third-party.mjs`](../scripts/third-party.mjs)), after the sidecar bundle: Mini-Me's
`NOTICE` and license, then every Rust crate, npm package and Python package the app ships, with
its license texts, which Settings → About shows as "Third-party Software". It lists the crates
of the build machine's platform, and the build fails if a component declares no license. A dev
dependency whose own files are built into the interface, such as `shadcn`'s stylesheet, is
listed in the script's `BUILT_IN`.

## Building the UI

[DESIGN.md](../DESIGN.md) holds the design rules. This is where the code follows them:

- **Design files.** The Claude Design project holds the reference screens: `Mini-Me Screens.dc.html`
  (section **Floating sheets**, screens F01–F15), `Mini-Me Glyph.dc.html` (the avatar component)
  and `Mini-Me Brand.dc.html` (app icon ideas, the wordmark, default Mini-Mes, banners). They are a
  reference, not the source of names: the app's own names win, so the design's "Drive" is Files.
- **Tokens.** The palette and every role token are at the top of `:root` in `src/index.css`. A new
  text token must also be registered in `src/lib/utils.ts`, or `cn()` drops it.
- **Mini-Me colours.** `src/components/minime/miniMeColors.ts` derives `wash` and `edge`.
  `surfaceStyle(colors)` sets `--mm-tint`, `--mm-solid`, `--mm-ink`, `--mm-wash` and `--mm-edge` on
  an element; inside it, use `bg-wash`, `bg-tint`, `border-edge` and `text-mm-ink`.
- **Components.** shadcn/ui components live in `src/components/ui`; add one with the shadcn CLI,
  then restyle it to DESIGN.md. The shared pieces DESIGN.md describes are `MiniMeSurface` (Mini-Me
  card), `AccountCard` (white card in Settings), `MiniMePill` (name tag), `ReferenceChip` (files,
  tables and charts), `MetaParts` (details kept apart by a gap), the sheets and headers in
  `src/components/shell/Sheet.tsx` and `SectionPage.tsx`, and `EditorHeader` in
  `src/components/library/LibraryParts.tsx`.
- **App icons.** `src-tauri/icons/app-icon.svg` is the release icon and `app-icon-canary.svg` the
  Mini-Me Canary icon (`tauri.canary.conf.json`). Regenerate them with
  `npx tauri icon src-tauri/icons/app-icon.svg` and
  `npx tauri icon src-tauri/icons/app-icon-canary.svg --output src-tauri/icons/canary`, keeping
  only the files the configs list. The release icon is full bleed (Windows); the Canary icon's
  artwork is inset to an 824px shape on the 1024px canvas, as macOS expects.

## Tests

```bash
npm test                                          # frontend (Vitest)
cd sidecar && uv run pytest                       # Python sidecar
cd src-tauri && cargo test                        # Rust core
```

CI ([`ci.yml`](../.github/workflows/ci.yml)) runs the frontend, sidecar and Rust tests on
every pull request into `dev` or `main`.

## Canary builds

Every push to `dev` that changes more than Markdown files, `docs/` or `openspec/` builds Mini-Me
Canary for Windows, macOS and Linux ([`canary.yml`](../.github/workflows/canary.yml)). Once every
platform built, the build is published as a pre-release named and tagged after its commit:
"Mini-Me Canary a1b2c3d", `canary-a1b2c3d`. Installed copies of Mini-Me Canary update to it at
their next check; Mini-Me never sees it. Nothing has to be done by hand.

- **By hand:** Actions → Canary → Run workflow builds the newest commit of `dev`. A commit that
  already has a build is not built again.
- **The feed:** the pre-release tagged `canary` holds only `latest.json`, which installed copies
  read to find the newest build. Each build replaces it. Do not delete that pre-release.
- **The hidden version:** the updater installs only a version above the running one, and a commit
  hash has no order, so each build is also given the version `0.0.<run number>`, which shows in
  the installers' file names. The run number belongs to `canary.yml`: renaming that file starts
  it again from 1, and installed copies would stop updating.
- **Failures** are handled as for a release, below.

`canary.yml` and `release.yml` have the same jobs and steps in the same order. A change to the
pinned actions, the Linux packages or the bundle list is made in both.

## Cutting a release

A release is a version that `main` carries and no tag has yet. Merging `dev` into `main` builds
and publishes it ([`release.yml`](../.github/workflows/release.yml)).

1. While working, each pull request adds its line to `CHANGELOG.md`, under "New", "Improved" or
   "Fixed" (leave out an empty section), in plain language for users. The first change after a
   release replaces that release's notes, so the file holds only the notes of the release being
   prepared: the app bundles it for its "What's new" page, and the GitHub release shows the same
   text.
2. To release, give the changelog's first line the new version, `# Mini-Me 0.8.0`, and run
   `npm run sync-version`, which copies that version into `package.json` and `package-lock.json`
   and commits nothing. Commit the three files to `dev` as `chore(release): 0.8.0`.
3. Try the Canary build of that commit. It is the code about to be released, and nobody tries a
   release's installers before they reach users.
4. Open the pull request from `dev` into `main`, wait for CI, and merge it.
5. The Release workflow starts when `main` changes. If the version has no tag, it creates a draft
   release with the changelog as its notes, and builds the Windows installer, the macOS `.dmg` and
   `.app.tar.gz`, the Linux AppImage and `.deb`, each update file's `.sig`, and `latest.json` with
   an entry per platform. Once every platform built, it publishes the release, which creates the
   tag `v0.8.0`, and installed apps see it at their next check. A merge into `main` whose version
   is already tagged builds nothing.

If a platform's build fails, the release stays a draft, no tag is made and no user is offered
anything. Either re-run the failed jobs of that run in Actions, which upload into the same draft
and then publish it, or merge a fix into `main`: the old draft is deleted and the same version is
built again from the new commit. A newer change to `main` also replaces a build still in progress.

The app version is read from `package.json`: `npm run sync-version` copies it there, and into
`package-lock.json`, from the changelog's first line, and `src-tauri/tauri.conf.json` reads it
from `../package.json`, so the app, its installers and its update files carry it. The version in
`src-tauri/Cargo.toml` is a fixed `0.0.0` that nothing reads. `npm run check-version` checks that
everything agrees, and CI runs it on every pull request.

The update files are signed with the key in the `TAURI_SIGNING_PRIVATE_KEY` repository
secret. Its password is in `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The maintainer keeps a
backup of the key at `~/.tauri/mini-me.key`, with the password in the macOS keychain item
`mini-me-update-key`. If the key is lost, installed apps can no longer update themselves
and must be reinstalled by hand once.
