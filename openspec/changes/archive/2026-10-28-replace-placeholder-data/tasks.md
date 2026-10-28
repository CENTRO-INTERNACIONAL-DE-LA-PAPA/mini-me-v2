# Tasks

## 1. User profile

- [x] 1.1 Add `user_profile.rs`: load `user-profile.json` from Mini-Me Data (missing → no name; unreadable → no name, reason kept, saves refused), and save a name (trimmed, at most 100 characters, empty removes it, other keys kept, written through a temporary file and a rename); verify with inline Rust tests for missing, saved-then-reloaded, cleared, too long, and unreadable-file-unchanged
- [x] 1.2 Open the profile store in `AppState` and add the `get_user_profile` and `save_user_name` commands, registered in `lib.rs`; verify `cd src-tauri && cargo test` passes
- [x] 1.3 Add the profile type and commands to `src/api.ts` and `src/protocol/types.ts`, and a `useUserProfile` hook with `refreshUserProfile()` in `src/hooks/`; add a pure function for first name and initials with a `*.test.ts` covering two-word, one-word and no name; verify `npm test` passes
- [x] 1.4 Add a Profile page to Settings with the "Your name" field, its save, its error and the unreadable-file message; verify in the app that saving, clearing and a 101-character name behave as the spec says
- [x] 1.5 Make the sidebar's Settings button and Files' "You" read the profile instead of `PLACEHOLDER_USER`; verify in the app that a saved name shows its initials in both without a restart, and that with no name the Settings icon and a bare "You" show

## 2. Home

- [x] 2.1 Add `list_paused_approvals` in the Rust core: read each listed Project's `project.sqlite` read-only with a busy timeout, skip newer or unreadable databases, and return each paused reply's Project, Conversation, message, Mini-Me and prompt, newest first; verify with inline Rust tests for two Projects ordered by pause time, an answered approval not listed, and a newer-schema Project skipped and unchanged
- [x] 2.2 Let `App.tsx` open a Project at a Conversation and message, keeping the Overview as the default when a Project is opened from the list; verify `npx tsc --noEmit` passes
- [x] 2.3 Make Home's greeting use the profile's first name, and "Waiting on you" list the paused approvals fetched when Home is shown, with a Review button that opens the reply and an empty state; verify in the app that Review opens the paused reply in its Project and that the entry is gone after approving and returning Home

## 3. Background replies

- [x] 3.1 Keep each run's current Step name in `runs.rs`, add subscribers to `Runs`, and notify them with the whole list of running replies when a run starts or resumes, starts a Step, or ends (completed, failed, cancelled, paused or failed to start), looking up Conversation titles after releasing the runs lock; verify with inline Rust tests that a started run is listed, its Step updates, and a paused or finished run leaves the list
- [x] 3.2 Add the `get_running_replies` and `subscribe_running_replies` commands, registered in `lib.rs`; verify `cd src-tauri && cargo test` passes
- [x] 3.3 Add the commands and type to `src/api.ts` and `src/protocol/types.ts`, and a `useRunningReplies` hook in `src/hooks/` that subscribes once; verify `npx tsc --noEmit` passes
- [x] 3.4 Rebuild the Jobs panel on every running reply, the open Conversation's first (Mini-Me, current Step, and Conversation and Project for the others), with the count on its button, an empty state, and clicking scrolling to the reply in the open Conversation or opening it in its Project; remove the queued, scheduled, recent, progress, Pause and Stop parts; verify in the app with a reply running in another Conversation

## 4. Conversation Outline

- [x] 4.1 Add `src/components/chat/outline.ts`, which groups a Conversation's Mini-Mes, files and tables and charts in order of first appearance with the messages each appears in; verify with `outline.test.ts` covering the cleaned-table example, a file counted across attachment and `#` references, and an empty Conversation
- [x] 4.2 Add `OutlinePanel` to `SidePanels.tsx`, with clicking cycling through an entry's messages, and offer it in `ChatView` in place of the To-do panel; verify in the app that the Outline updates when a reply adds a chart and that repeated clicks move through the messages

## 5. Removals and docs

- [x] 5.1 Delete `src/placeholders.ts`, `SampleTag.tsx` and `TodoPanel`, and remove every remaining `PLACEHOLDER_` reference; verify `grep -rn "PLACEHOLDER_\|SampleTag\|placeholders" src` finds nothing and `npm test` and `npx tsc --noEmit` pass
- [x] 5.2 Update `DESIGN.md`'s tool-sheet list and its To-do and Jobs notes to describe the Outline and the Jobs panel as built; verify the file no longer describes the To-do panel or queued, scheduled and recent jobs
- [x] 5.3 Run the full checks: `cd src-tauri && cargo test`, `npm test` and `cd sidecar && uv run pytest`; verify all pass

## Workflow follow-up

- The user verifies the change in the app.
- Archive the change with `/opsx:archive`, syncing its specs into `openspec/specs/`.
- Mark this change "Done" in `docs/roadmap.md` and Document mode "Next".
- Ask the user, then open the pull request into `dev`.
