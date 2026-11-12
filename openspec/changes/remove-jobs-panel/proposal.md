# Proposal

## Why

The Jobs panel, which lists every running reply in any Project, is no longer used. Home's
running indicator, the sidebar's statuses and the end-of-reply notifications already tell the
user what is running, so the panel and the data kept only for it are clutter.

## What Changes

- **BREAKING (UI):** a Conversation no longer offers the Jobs panel or its button.
- The running-replies report loses the fields only the panel read: the Project's name and the
  Step a reply last started. The core no longer tracks that Step for the report, nor sends the
  list again each time a Step starts. A reply's own Step progress is unchanged.
- The running-replies report stays for Home, the sidebar and notifications.
- Out of scope: any other side panel, Home, notifications, and opening a reply from Home.

No new external service, credential or cost.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `background-replies`: the report no longer names the Project or the Step and is not resent on
  a Step start; the Jobs panel and opening a reply from it are removed.
- `conversation-outline`: a Conversation offers the Outline, Report and Steps panels.
- `document-comments`: the list of places threads stay out of no longer names the Jobs panel.

## Impact

- UI: `src/components/chat/SidePanels.tsx`, `ChatView.tsx`, `src/protocol/types.ts`
  (`RunningReply`), `src/components/shell/Sheet.tsx` comments, `docs/using.md`.
- Rust core: `runs.rs` (`RunningReply`, the run's Step tracking and its notify on a Step start).
- No protocol event or link frame changes; the IPC result of `subscribe_running_replies` loses
  two fields.
