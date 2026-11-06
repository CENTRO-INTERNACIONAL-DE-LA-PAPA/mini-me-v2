# Tasks

## 1. Collecting

- [x] 1.1 Add `scripts/third-party.mjs` and `npm run third-party`, which writes `src-tauri/resources/third-party.json` (Mini-Me's notice and license, then each Rust crate, npm package, Python package and the Python runtime with its part, version, repository and license texts, each distinct text stored once) and fails on a component that declares no license; verify by running it after `npm run bundle-sidecar` and checking `serde`, `react` and `pandas` with their texts, with tests of its pure helpers

## 2. Shipping

- [ ] 2.1 Run `npm run third-party` in the release config's `beforeBuildCommand`, bundle the file as a resource, and document it in `docs/development.md`; verify with a local release build that the app contains it

## 3. The page

- [ ] 3.1 Add `get_third_party` to the core, and the "Third-party Software" row and page to Settings → About, with Mini-Me's notice and license, the table of contents by part going to each section, and the line for builds without the file; verify with `cargo test`, `npm test`, and in the app that a development build shows that line

## Workflow follow-up

- Archive the change with `/opsx:archive`, then open the pull request into `dev`.
