# Design

## Context

`release.yml` creates one draft release in a `draft` job, then a `build` matrix uploads
each platform's installer and update file to it with `tauri-action`, which also merges each
job's entry into the release's `latest.json`. The matrix has one entry, `windows-latest`
with the `nsis` bundle; a `macos-latest` entry (`app,dmg`) existed until releases were
narrowed to Windows. `sidecar/scripts/bundle.py` already bundles the standalone Python for
macOS and Linux (`bin/python3`) as well as Windows.

## Goals / Non-Goals

**Goals:**
- Every tag builds all three platforms into the same draft, each with its update file.

**Non-Goals:**
- Signing, notarization, Intel Macs, ARM Linux, `.rpm`.

## Decisions

### Matrix entries (CI)
- `macos-latest` with `--bundles app,dmg`: Apple silicon only, as before. The `app` bundle
  produces the `.app.tar.gz` update file the macOS updater installs.
- `ubuntu-22.04` with `--bundles appimage,deb`: an AppImage links against the build
  machine's glibc, so building on 22.04 rather than `ubuntu-latest` keeps it running on
  22.04 and newer. Only the AppImage gets an update file; the `.deb` is installed and updated
  by hand.
- The Linux job installs Tauri's system libraries first (`libwebkit2gtk-4.1-dev`,
  `libappindicator3-dev`, `librsvg2-dev`, `patchelf`), in a step that runs only on Linux.
- `fail-fast: false` stays, so one platform's failure does not cancel the others; the draft
  stays unpublished until the maintainer has checked it.

*Alternative:* a universal macOS app covering Intel too. Rejected: it needs the bundled
Python for both architectures in one app, which `bundle.py` does not produce.

### Update entries
`updaterJsonPreferNsis: true` stays, so the Windows entry keeps pointing at the NSIS
installer; the macOS and Linux jobs add `darwin-aarch64` and `linux-x86_64` entries to the
same `latest.json`. No app change is needed: the updater already looks up its own platform.

## Risks / Trade-offs

- [A sidecar dependency has no wheel for a platform] → the build fails for that platform
  only, and the draft shows which; the earlier macOS releases bundled the same sidecar.
- [Unsigned macOS app is blocked as "damaged" after download] → the README gives the
  `xattr` step; updates installed by the app itself are not quarantined.
- [Linux is untested by the maintainer] → the draft is tried before it is published, and a
  Linux failure does not hold back the Windows and macOS builds.

## Migration Plan

None for users. The first tag after this change produces all three platforms; earlier
macOS builds made by hand keep working but do not update until replaced by the release's
disk image.
