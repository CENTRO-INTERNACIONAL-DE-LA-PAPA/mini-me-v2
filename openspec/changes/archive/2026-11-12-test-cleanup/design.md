# Design

## Context

See proposal.md for why. The tests live where the project rules put them: inline
`#[cfg(test)] mod tests` in each Rust file, `*.test.ts(x)` next to the frontend code, and
`sidecar/tests/test_<module>.py`. The evidence for each removal (test names and line numbers) was
gathered in a read-only scan of the whole project on 2026-11-11.

Home reads every Project's database read-only through `projects::read_each`, without migrating
it, so Home's queries meet older schemas. Two workarounds exist only for that: `not_a_thread`
probes `sqlite_master` for `comment_threads` (called from 9 places), and `recent.rs` ignores any
error from reading paused replies. Opening a Project migrates it.

Stored `message.created` events are never read back in production: opening a Conversation reads
the message tables, and `message_views` reads back only failure, progress, pause and resume
events. The test fixtures (`fixtures/events.json`, `fixtures/replay.json`) already carry
`components` and `steps` on every message.

## Goals / Non-Goals

**Goals:**
- Every remaining test checks behaviour of our own code that no other test checks.
- Tests stop breaking on harmless edits to data, version numbers or tool lists.
- Each process keeps its own tests: Rust core, UI and sidecar; nothing moves across them.

**Non-Goals:**
- New tests, except where a merge turns several tests into one table test.
- Changing app behaviour beyond the old-Project workarounds.

## Decisions

1. **A test goes if it checks a version, data, a dependency or a model call; it stays if it
   checks our logic.** For example, `test_plot.py`'s test of dates with a time zone or beyond 2262
   stays: it reads like a pandas test but checks our own handling in `plot.py`. The state-format
   test in `test_workflow_graph.py` (`'{"format": 99}'`) stays because refusing an unreadable
   saved run is our behaviour.
2. **Duplicates become table tests rather than being deleted one by one**, so each case stays
   covered and the cases read as one list.
3. **Migration tests share one helper** (`at_version(n)`: a database built by the first `n`
   migrations) instead of repeating the same 12 lines in each test.
4. **`not_a_thread` keeps its place and loses its probe.** It becomes a plain SQL condition with
   no database access. Folding the nine callers into one shared filter is helper work for #26.
5. **Old Projects drop out of Home until opened.** When a Home query meets a missing table, the
   error leaves that Project out, as `read_each` already does for an unreadable one. The
   alternative, migrating Projects on read, would let Home write to Projects nobody opened, which
   `read_each` avoids on purpose.
6. **`Message.components` and `Message.steps` lose `#[serde(default)]`**, and the UI loses its
   `?? []`. The other `#[serde(default)]` fields (`reply_to`, `attachments`, `text_components`)
   stay, because they are optional by design, not for old events.
7. **Test-only code goes with its tests**: `lib.rs`'s `app_context()` wrapper, `TableView`'s
   `initialSorting` prop and `decide.py`'s `make_chat` parameter exist only for tests being
   removed or rewritten.
8. **`test_tool_lists.py` stays until #28**, which replaces both name lists with one JSON file and
   makes that test unnecessary. Changing it now would be undone there.
9. **The three Quarto render tests merge into one** that still returns early without Quarto
   (`renders_with_the_users_quarto_when_it_is_installed`,
   `a_document_that_names_its_output_still_exports`, `a_render_that_fails_reports_quartos_message`).
   It is the only check that a real render works. Deleting them, or marking them `#[ignore]`, was
   rejected.
10. **The two draft cancellation tests stay** (a cancelled draft, and one cancelled before it
    starts, both end with `draft.done`); the rest of `test_draft.py` goes. They use a fake chat
    model, but they check our protocol rule, not the model.
11. **Shared sidecar test fakes move to `sidecar/tests/conftest.py`** (`FakeLink` from 3 files,
    `FakeContext` from 8, `ECHO` from 2), the usual pytest place, instead of staying copied.
12. **The 7 "a thread is not listed here" tests stay** (assets, approvals, conversations,
    overview, recent, routing, runs): each listing applies the filter on its own until #26
    shares it.

## Risks / Trade-offs

- [Removing the real-sidecar tests leaves no test where the real Rust core and Python sidecar talk
  to each other] → Both sides keep their contract tests against the shared fixtures
  (`fixtures/sidecar-frames.json` in `link.rs`); a manual run of the app checks the rest.
- [A Project not opened since before comment threads disappears from Home's lists] → Accepted;
  opening it from the Project list migrates it and brings it back.
- [Deleting the sidecar model-call tests drops some checks of our own logic around the model]
  → The two draft cancellation tests stay (decision 10).
- [The merged Quarto render test passes without doing anything in CI, which has no Quarto] →
  Accepted; it runs on a developer machine with Quarto installed (decision 9).
