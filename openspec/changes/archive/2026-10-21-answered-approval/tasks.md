# Tasks

## 1. Showing an approval only while it asks

- [x] 1.1 In `MessageItem`, leave out an `approval` component unless `approvalState` is `asking`. Verify in the app that an answered approval and one whose reply was stopped show no prompt, and a paused reply still shows the prompt with Approve and Reject.
- [x] 1.2 Reduce the `approval` renderer to the prompt with Approve and Reject, and update `approval.test.tsx` to the asking state and `approvalState`'s results. Verify `npm test` passes.

## 2. The approval's answer in the progress card

- [x] 2.1 Add `approvalAnswers(steps, components)` to `WorkflowProgress.tsx`, matching the *n*-th run of an approval Step to the *n*-th `approval` component with its `step_id`. Verify with a test covering an approved Step, a rejected one, one still waiting, and an approval answered twice in a loop.
- [x] 2.2 Pass the message's components to `WorkflowProgress` and show ` · approved` or ` · rejected` after a done approval Step's name. Verify in the app that approving Investigator's approval shows "· approved" in the card, also after reopening the Conversation.

## 3. Specs and integration

- [x] 3.1 Run `openspec validate answered-approval --strict` and confirm it passes.

## Workflow follow-up

- Archive the change (`/opsx:archive`), then open the pull request into `dev` closing #27.
