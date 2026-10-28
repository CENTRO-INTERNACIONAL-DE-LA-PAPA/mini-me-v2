# Tasks

## 1. Release workflow

- [x] 1.1 Add `macos-latest` (`app,dmg`) and `ubuntu-22.04` (`appimage,deb`) to the build matrix in `.github/workflows/release.yml`, with a Linux-only step installing Tauri's system libraries, and update the file's header comment; verify the workflow parses with `gh workflow view release.yml` after pushing the branch

## 2. Docs

- [x] 2.1 Rewrite README's Installing section for the three platforms, with the macOS and AppImage first-launch steps; verify it names the macOS, AppImage and `.deb` files a release contains
- [x] 2.2 Update `docs/development.md`'s Cutting a release for the three-platform draft; verify step 3 lists every platform's files

## Workflow follow-up

- After the next release is cut, confirm the draft holds the Windows, macOS and Linux files and a `latest.json` with `windows-x86_64`, `darwin-aarch64` and `linux-x86_64` entries.
- Archive the change with `/opsx:archive`, syncing its specs into `openspec/specs/`.
- Ask the user, then open the pull request into `dev`.
