# Tasks

## 1. Core

- [x] 1.1 Remove `project_name` and `step` from `RunningReply` in `runs.rs`, the run's Step
  tracking that only fed them, and the running-list notify on a Step start (a reply's Step
  events stay); update the running-replies tests to the report's new fields; verify with
  `cargo test`.

## 2. UI

- [x] 2.1 Remove `JobsPanel`, the Jobs button, its count and the `jobs` ordering in `ChatView`,
  the two fields from `RunningReply` in `types.ts`, the Jobs mentions in `Sheet.tsx` comments
  and `docs/using.md`, and any import or icon left unused; verify with `npm test`,
  `npx tsc --noEmit`, and in the app that a Conversation offers Outline and Report, Home still
  marks a running Project, and a reply finishing elsewhere still notifies.

## Workflow follow-up

- Archive with `/opsx:archive`, syncing the three delta specs, then open the pull request into
  `dev`.
