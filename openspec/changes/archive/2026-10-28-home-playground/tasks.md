# Tasks

## 1. Recent conversations

- [x] 1.1 Move the read-only walk over Projects from `approvals.rs` into a shared helper in `projects.rs` and use it in `approvals::list`; verify the existing approvals tests still pass with `cd src-tauri && cargo test approvals`
- [x] 1.2 Add `list_recent_conversations`, returning the 5 most recently active Conversations across Projects with their Project, newest first; verify with inline Rust tests for ordering across three Projects with eight Conversations and a newer-schema Project skipped and unchanged
- [x] 1.3 Add the type and call to `src/protocol/types.ts` and `src/api.ts`, and make `App.tsx`'s `openReply` an `openConversation(projectId, conversationId, messageId?)` used by Home, the Jobs panel and the sidebar; verify `npx tsc --noEmit` passes
- [x] 1.4 Show the Recent group in `AppSidebar` with no Project open, fetched whenever Home is shown and left out when empty; verify in the app that clicking an entry opens its Project and Conversation

## 2. Mini-Me playground

- [x] 2.1 Add `matter-js` and `@types/matter-js` to `package.json`; verify `npm install` succeeds and `npx tsc --noEmit` passes
- [x] 2.2 Add a pure helper that tells a click from a drag, with a `*.test.ts`; verify `npm test` passes
- [x] 2.3 Add the playground component in `src/components/home/`: one circle body per Mini-Me, walls that follow the sheet's size, staggered drop-in, avatars positioned through refs, the loop stopping while every body sleeps, and reduced motion stepping the pile to rest before showing it; verify in the app that every Mini-Me, including a user-made one, drops in and piles at the bottom, and stays inside when the window is resized
- [x] 2.4 Add grabbing, dragging and throwing through hit-testing on `pointerdown`, skipping cards, buttons, links and fields, and the name tag on a click; verify in the app that a throw keeps its momentum, clicking a Project card over a Mini-Me opens the Project, scrolling still works, and a click shows the Mini-Me's name
- [x] 2.5 Render Home in `App.tsx` with the playground behind the scrolling content; verify in the app with reduced motion on that the Mini-Mes appear already settled

## 3. When the Mini-Mes appear

- [x] 3.1 Add `home.show_mini_mes` (default off) to `settings.rs` with `get_home_settings` and `set_show_home_mini_mes`; verify with an inline Rust test that a settings file without it loads with the flag off
- [x] 3.2 Add a pure matcher for Up, Up, Down, Down, Left, Right, Left, Right with a `*.test.ts`; verify `npm test` passes
- [x] 3.3 Give the playground a batch count that starts at 1 only when the flag is on and grows on the key sequence, each batch joining the pile, (skipping keys typed in fields), spawn at random x positions, and size the avatars at 64px; verify in the app that Home shows no Mini-Mes by default, the sequence drops them in, and pressing it again adds another batch on top
- [x] 3.4 Add the Appearance page with "Show Mini-Mes on Home" to Settings; verify in the app that turning it on makes them appear on Home, also after a restart

## 4. Docs and checks

- [x] 4.1 Describe the playground and the Recent group in `DESIGN.md`; verify the Home description matches what the app shows
- [x] 4.2 Run `cd src-tauri && cargo test`, `npm test` and `cd sidecar && uv run pytest`; verify all pass

## Workflow follow-up

- The user verifies the change in the app.
- Archive the change with `/opsx:archive`, syncing its specs into `openspec/specs/`.
- Mark this change "Done" in `docs/roadmap.md` and Document mode "Next".
- Ask the user, then open the pull request into `dev`.
