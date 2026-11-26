# Design

## Context

See proposal.md for why. Today an approval travels like this:

- **Pause.** The sidecar's approval node (`workflow/graph.py` `_approval`) calls `interrupt({"step_id"})`. `Run.execute` (`runs.py`) saves the graph state and sends `run.paused` `{ step_id, output, state }`. The core's `save_pause` (`runs.rs`) takes the prompt from the Step definition, and `pause_reply` (`conversations.rs`) adds the `approval` component `{ step_id, prompt }` and stores the paused run.
- **Answer.** The UI calls `answer_approval(…, approved)` (`api.ts`, `ipc.rs`). `conversations::answer_approval` persists `component.answered` `{ approved }` and the approval Step's `step.completed` with no output. It then resumes or completes the reply.
- **Resume.** `Runs::resume` sends `run.start` with `resume` `{ state, step_id, approved: true }`. The sidecar ignores `approved` and resumes with `Command(resume=True)`. The approval node runs again from its start (skipping `step.started` because it is not the first visit) and returns nothing to the log, so later Steps never see an output from it.

A condition asks the model through `Run.decide` → `decide()` (`workflow/decide.py`), which builds its material from the user's message and the earlier outputs. Data Traits ask through `choose()` (`adapters/data/choose.py`), which sends only the message and the tables' descriptions.

## Goals / Non-Goals

**Goals:**
- One approval Step and one pause/resume path for yes-or-no and written answers.
- An approval's answer reaches later Steps as an ordinary earlier output.

**Non-Goals:**
- Changing how a yes-or-no approval looks or behaves.
- Asking from inside a Trait call.

## Decisions

### Settled with the user

1. **Extend the approval Step** with a written answer instead of adding a Step kind. Approvals without the new settings stay as they are.
2. **Both kinds of questions:** shown as written by default, or written by the AI model from the prompt as an instruction.
3. **The answer is typed in the component**, not in the composer.
4. **Skip resumes the run** with no output; only Reject ends a reply.
5. **Data Traits read earlier outputs** in `choose()`.

### Approach

6. **The core owns the answer; the sidecar owns the questions.**
   - The core persists the answer and the approval Step's `step.completed`, now with an `output` of the questions and the sent text ("I asked: … The user answered: …"), as it already does with none. Only the core has both: the questions are in the approval component.
   - The answer alone, without its questions, was too little for a later Step: in a test, *Plan* ignored "1. I want to bake a lemon pie" without the question it answered.
   - The sidecar receives the text in `resume` and puts it in the run's log as the approval Step's output, so `visible_outputs` gives it to later Steps.
   - The sidecar does not send a second `step.completed` for the approval.
7. **Resume value.** `Run.execute` resumes with `Command(resume={"text": resume.get("text")})`. The approval node keeps `interrupt()`'s return value and, when it holds text, returns a log entry with that output.
8. **Model-written questions are asked on the first visit only.** The node asks the model before `interrupt()` and passes the questions in the interrupt's value. On resume the node runs again from its start; `env.first_visit(step)` is false then, so the model is not asked twice. `Run.execute` sends the questions as `run.paused`'s `prompt`; the core uses it in place of the Step's `prompt`.
9. **One way to build the model's material.** `decide()` and the new questions call share a helper in `workflow/decide.py` that writes the message and the `--- <name> ---` blocks of earlier outputs. The questions call asks for plain text with `ask_structured` on a one-field schema, so every provider answers the same way.
10. **`needs_model`** counts an approval with `questions_by` `"model"` as a decision, so a run without a model fails with `model_not_set` before it starts, as conditions do.
11. **The UI's answer states** grow from approved/rejected to answered/skipped. `approvalState` reads `{ text }` and `{ skipped }`, and `ANSWER_LABELS` gains "Answered" and "Skipped". A done written-answer approval in the progress card and the Steps timeline shows its questions (the component's `text`) and the answer.

## Risks / Trade-offs

- **[Questions call fails]** The model may not answer, or answer with nothing. → The reply fails with `questions_failed` (decision 15).
- **[Earlier outputs in `choose()`]** Data Traits' prompts get longer in Workflows with long earlier outputs. → They take the same `visible_outputs` list, already cut to the newest 50,000 characters.
- **[Answer as instructions]** A written answer is passed on as text that later models read. → It is the user's own text in their own run; no extra handling.

### Settled after drafting

12. **Field names:** the Step's `answer: "text"` and `questions_by: "model"`, and the component answer `{ text }` or `{ skipped: true }`. A string `answer` leaves room for other answer kinds later, such as a choice from a list.
13. **One IPC command:** `answer_approval` takes an `answer` object, `{ approved } | { text } | { skipped: true }`, in place of `approved: bool`. The core checks it against the approval's kind: a `{ text }` or `{ skipped }` answer to a yes-or-no approval, an `{ approved }` answer to a written-answer one, and blank text are refused with `invalid_answer`.
14. **Buttons and box:** Skip and Send, right-aligned like Approve and Reject, under a multi-line text box where Enter adds a line and Ctrl/Cmd+Enter sends.
15. **A failed questions call fails the reply** with code `questions_failed`: "I couldn't write my questions; send your message again." Showing the instruction instead would show the user text that was not written for them.
