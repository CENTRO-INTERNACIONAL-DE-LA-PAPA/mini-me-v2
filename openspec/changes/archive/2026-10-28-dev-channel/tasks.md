# Tasks

## 1. Identity

- [x] 1.1 Make `tauri.dev.conf.json` the Mini-Me Dev identity (identifier `org.cipotato.mini-me.dev`, product name and window title "Mini-Me Dev", dev icons); verify the file is valid JSON and `npm run check-version` still passes
- [x] 1.2 Add `projects::data_folder_name(identifier)` and pass the result to `ensure_data_root`, and a keychain service set once from the identifier in `secrets.rs`; set both from `app.config().identifier` in `AppState::init`; verify with inline Rust tests for both identifiers and `cd src-tauri && cargo test`
- [x] 1.3 Verify in the app that `npm run tauri:dev` opens as "Mini-Me Dev" with an empty Project list, no saved keys, and that the installed Mini-Me still shows its Projects and keys

## 2. Version in Settings

- [x] 2.1 Regroup Settings into General (your name, Mini-Mes on Home), Models & keys, Accounts and About, and fill About with a short description of Mini-Me, the app's name and version from `@tauri-apps/api/app`, and the CIP × Ai2 logos; verify `npx tsc --noEmit` passes and, in the app, that it reads "Mini-Me Dev 0.4.0" under `tauri:dev` and shows both logos at the same height

## 3. Updates and docs

- [x] 3.1 Start update checks only outside Mini-Me Dev (`projects::is_mini_me_dev`), and remove the update feed from `tauri.dev.conf.json`; verify `cd src-tauri && cargo test` passes
- [x] 3.2 Document Mini-Me Dev in `docs/development.md`: what it is and that `tauri:dev` runs it with its own data and keys; verify the Running the app section matches `tauri.dev.conf.json`

## 4. Developer mode

- [x] 4.1 Store Developer mode in `settings.rs`, defaulting to on in Mini-Me Dev and off in Mini-Me, with `get_developer_mode` and `set_developer_mode`, and keep Jev's answers only while it is on; verify with the defaults test and `cd src-tauri && cargo test`
- [x] 4.2 Add the Developer mode switch to About; gather "[DEBUG] Jev's confidence threshold", "[DEBUG] Show Jev's answers" and "[DEBUG] Avatars" in General → Developer and show them, and the "[DEBUG] Jev" details, only while it is on; remove the sidebar's Avatars button; verify in the app that turning it off hides all of them and turning it on brings them back, and that the Avatars page returns to Settings
- [x] 4.3 Build with Tauri's `devtools` feature and create the main window in `lib.rs` with the inspector only in Developer mode, and cancel the right-click menu outside text fields while it is off; verify in the app that with Developer mode off (after a restart) right-click shows nothing outside text fields and Inspect is unavailable, and with it on (after a restart) Inspect works

## 5. Housekeeping

- [x] 5.1 Delete `.vscode/extensions.json` and replace the two `.vscode` lines in `.gitignore` with `.vscode/`; verify `git ls-files .vscode` is empty

## 6. Checks

- [x] 6.1 Run `cd src-tauri && cargo test`, `npm test` and `cd sidecar && uv run pytest`; verify all pass

## Workflow follow-up

- The user verifies the change in the app.
- Archive the change with `/opsx:archive`, syncing its specs into `openspec/specs/`.
- Mark this change "Done" in `docs/roadmap.md` and Document mode "Next".
- Ask the user, then open the pull request into `dev`.
