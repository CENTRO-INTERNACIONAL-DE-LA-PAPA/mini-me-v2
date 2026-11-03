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

`tauri:dev` runs the app as **Mini-Me Dev** (`src-tauri/tauri.dev.conf.json`): the
identifier `org.cipotato.mini-me.dev`, the development icon and its own data. Its Projects
are in `Documents/Mini-Me Data (Dev)`, and its settings, logs and keychain entries are kept
under its identifier, so development never touches the installed Mini-Me's Projects or keys.
Set up its API keys and Ai2 sign-in once in Mini-Me Dev's Settings.

In development the app starts the sidecar from `sidecar/` with `uv run`. Its log is
`sidecar.log` in the app's log directory; set `MINI_ME_LOG_FRAMES=1` to also log every frame
of the link (secrets are redacted).

Release build, with the standalone Python and the sidecar bundled into the installer:

```bash
npm run tauri:release
```

Local release builds produce no update files and need no signing key, and a local build
does not update itself.

## Tests

```bash
npm test                                          # frontend (Vitest)
cd sidecar && uv run pytest                       # Python sidecar
cd src-tauri && cargo test                        # Rust core
cd src-tauri && cargo test -- --include-ignored   # also the tests that start the real sidecar
```

CI ([`ci.yml`](../.github/workflows/ci.yml)) runs the frontend, sidecar and Rust tests on
every pull request into `dev` or `main`.

## Cutting a release

A release is a version that `main` carries and no tag has yet. You prepare it on `dev` with one
command, and merging the pull request does the rest
([`release.yml`](../.github/workflows/release.yml)).

1. Write `CHANGELOG.md` for the new version and leave it uncommitted. Its first line, `# Mini-Me 0.6.0`,
   is where the version comes from; then come "New", "Improved" and "Fixed" sections (leave out an
   empty one), in plain language for users. It holds only this release's notes: the app bundles it
   for its "What's new" page, and the draft release shows the same text.
2. On `dev`, run `npm run release`. It checks that `dev` is not behind `origin/dev`, that nothing is
   changed but the changelog, and that its version is new, then sets the version in `package.json`
   and `package-lock.json`, commits `chore(release): 0.6.0`, pushes `dev` and opens the pull request
   from `dev` into `main` with the changelog as its body. `npm run release -- --dry-run` says what it
   would do without doing it. If a step fails, run it again: it skips what is done.
3. Wait for CI on the pull request, then merge it into `main`. It never merges for you.
4. The Release workflow starts when `main` changes. If the version has no tag, it tags the merge
   commit `v0.6.0`, creates a **draft** release with the changelog as its notes, and builds the
   Windows installer, the macOS `.dmg` and `.app.tar.gz`, the Linux AppImage and `.deb`, each update
   file's `.sig`, and `latest.json` with an entry per platform. A merge into `main` whose version is
   already tagged builds nothing.
5. Try the installers from the draft, then click **Publish release**. Installed apps only see
   published releases.

If a platform's build fails, re-run the failed jobs of that run in Actions; they upload into the same
draft. To start again from scratch, delete the draft release and the tag, then run the Release workflow
on `main` by hand (Actions → Release → Run workflow).

The app version is set in `package.json` only. `package-lock.json` follows it through `npm version`,
and `src-tauri/tauri.conf.json` reads it from `../package.json`, so the app, its installers and its
update files carry it. The version in `src-tauri/Cargo.toml` is a fixed `0.0.0` that nothing reads.
`npm run check-version` checks that everything agrees, and CI runs it on every pull request.

The update files are signed with the key in the `TAURI_SIGNING_PRIVATE_KEY` repository
secret. Its password is in `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The maintainer keeps a
backup of the key at `~/.tauri/mini-me.key`, with the password in the macOS keychain item
`mini-me-update-key`. If the key is lost, installed apps can no longer update themselves
and must be reinstalled by hand once.
