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

`tauri:dev` runs the app with the development icon and the window title "Mini-Me (Dev)", so
you can tell it apart from an installed copy.

In development the app starts the sidecar from `sidecar/` with `uv run`. Its log is
`sidecar.log` in the app's log directory; set `MINI_ME_LOG_FRAMES=1` to also log every frame
of the link (secrets are redacted).

Release build, with the standalone Python and the sidecar bundled into the installer:

```bash
npm run tauri:release
```

Local release builds produce no update files and need no signing key. This is also how to
run Mini-Me on macOS, which has no published releases; a local build does not update itself.

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

Releases are built by GitHub Actions ([`release.yml`](../.github/workflows/release.yml))
from a version tag.

1. Set the new version in `package.json`, `src-tauri/tauri.conf.json` and
   `src-tauri/Cargo.toml`, then run `npm run check-version`.
2. Commit, then tag and push: `git tag v0.2.0 && git push origin v0.2.0`.
3. Wait for the workflow to finish. It creates a **draft** release with the Windows
   installer, its `.sig` and `latest.json`.
4. Try the installer from the draft, then click **Publish release**. Installed apps only
   see published releases.

The update files are signed with the key in the `TAURI_SIGNING_PRIVATE_KEY` repository
secret. Its password is in `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The maintainer keeps a
backup of the key at `~/.tauri/mini-me.key`, with the password in the macOS keychain item
`mini-me-update-key`. If the key is lost, installed apps can no longer update themselves
and must be reinstalled by hand once.
