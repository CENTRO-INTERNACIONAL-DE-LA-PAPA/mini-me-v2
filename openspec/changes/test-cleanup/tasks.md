# Tasks

Test names and line numbers come from the 2026-11-11 scan; check each against the code before
removing it. `cargo test` and `uv run pytest` may run on this machine; `npm test` is run by the user.

## 1. Baseline

- [x] 1.1 Record the number of tests in each suite (`cargo test`, `npm test`, which also runs
  `scripts/*.test.mjs`, and `uv run pytest`) in this file under "Counts", before anything
  changes; verify the three numbers are written down.

## 2. Old Projects

- [x] 2.1 Make `comments::not_a_thread` a plain SQL condition with no `sqlite_master` probe (and no
  `conn` argument), make `recent.rs` return the error from reading paused replies instead of
  ignoring it, and remove the missing-table legs of the tests (`recent.rs`
  `a_paused_reply_..._and_a_missing_table_none` and any other); verify with `cargo test`.
- [x] 2.2 Remove `#[serde(default)]` and the "stored before Interactive Components" doc from
  `Message.components` and `Message.steps` in `protocol.rs`, delete
  `a_message_stored_without_components_has_none`; remove the `?? []` defaults and their comment in
  `eventStore.ts` and the test "gives messages from events without components an empty list";
  verify with `cargo test` and `npm test`.

## 3. Rust: version, dependency and trivial tests

- [x] 3.1 Delete the version tests: `sidecar.rs` `a_version_14_sidecar_is_refused_naming_both_versions`,
  `lib.rs` `the_app_version_is_the_one_in_package_json` with the `app_context()` wrapper it exists
  for, and `quarto.rs` `a_version_before_the_minimum_is_too_old`; verify with `cargo test`.
- [x] 3.2 Cut `db.rs` to the migration tests that change data (from versions 6, 10 and 11),
  `newer_database_is_refused_and_unchanged` and `new_database_is_migrated`, built on one
  `at_version(n)` helper; verify with `cargo test`.
- [x] 3.3 Delete the dependency and trivial tests: `ai2.rs` `tokens_round_trip_as_json`;
  `protocol.rs` `envelope_serializes_to_spec_shape`, `ids_are_v7_and_ordered`,
  `a_message_view_is_the_message_with_its_shown_state`, and `a_component_reference_round_trips`
  once `fixtures/events.json` holds a component text reference (add one if not); `library.rs`
  `an_unknown_group_fails_to_load`; `secrets.rs` `keys_use_mini_mes_service_until_the_app_names_its_own`;
  `assets.rs` `unknown_asset_is_not_found`; `updates.rs` `nothing_to_install_without_a_download`;
  verify with `cargo test`.

## 4. Rust: snapshot tests

- [x] 4.1 Replace `library.rs`'s six tests that restate `builtin.json` (`builtin_library_is_consistent`,
  `built_in_traits_list_their_tools`, `mini_mes_run_their_step_trait`,
  `sixteen_mini_mes_ship_and_investigator_uses_every_control_step`,
  `placeholder_traits_run_on_echo_without_instructions`, `mini_mes_have_groups`) with one test that
  the built-in library has no problems, checking its format and never its content; in
  `user_library.rs`, use `Library::builtin().mini_mes.len()` instead of `16`; verify with
  `cargo test`.

- [x] 4.2 Remove the hand-written name lists: the exact tool list asserted in `routing.rs`
  `a_mention_with_a_thumbs_up_gets_a_reply_and_a_reaction_from_that_mini_me`, the event-type
  list in `protocol.rs` `fixture_round_trips_every_event_type` and the frame-type list in `link.rs`
  `fixture_round_trips_every_frame_type`; make `unknown_types_and_unreadable_lines_are_tolerated`
  use only a made-up type; verify with `cargo test`.

## 5. Rust: real-sidecar tests

- [x] 5.1 Delete the 7 `real_sidecar_*` tests and the `Real` harness in `sidecar.rs`, the
  `--test-adapters` path only they used (`adapters/testing.py`, the flag in `__main__.py`, the
  `test_adapters` parameters in the sidecar and in `Launch::command` and `Supervisor`), and the
  mentions of both in `docs/architecture.md` and `docs/development.md`; keep the Dataverse
  network test; verify with `cargo test`, `uv run pytest` and that `grep -rn include-ignored docs`
  finds nothing.

## 6. Rust: duplicates

- [x] 6.1 In `runs.rs`: delete the tests covered elsewhere (`a_paused_reply_is_not_running`,
  `a_valid_component_is_added_to_the_reply`, `a_dataverse_search_needs_a_query`), fold
  `runs_without_ai_adapters_or_decisions_get_no_model` into the missing-model test, and keep
  `a_running_reply_gives_its_conversation_the_running_status` and `every_run_lists_every_mini_me`,
  which nothing else covers; turn the 8 key-scope tests into 3 (Trait calls, decisions, requests
  outside a run); merge the component refusals, the ended-call refusals and the two timeout tests;
  make `start_route` and `start_summary` use `wait_for`; move the test `Recorder` into
  `runs::test_support` and use it from `routing.rs` and `sidecar.rs`; verify with `cargo test`.
- [x] 6.2 In `routing.rs`: turn the six `decide` tests on Jev's answers into one, keep the
  without-Jev and the files cases as their own tests, drop the `file_options` check that the
  routed case already makes, and import `SCRIBE` and `FALLBACK_MINI_ME` from `library` instead of
  re-declaring them; verify with `cargo test`.
- [x] 6.3 In `store.rs`, `conversations.rs`, `assets.rs` and `history.rs`: add a
  `send(project, conversation, text)` test helper in `store.rs` and merge its two debug-record
  tests; in `conversations.rs`, merge the naming, renaming and rejected-message tests (folding
  `rejects_empty_messages` in); in `assets.rs`, merge the same-name tests and the three ways a
  file comes in, and delete the `remove` test that the `delete` test covers; fold
  `the_first_message_has_no_history` into the history ordering test; verify with `cargo test`.
- [ ] 6.4 In `quarto.rs`: merge the three render tests into one that still returns early without
  Quarto, merge the three `locate` tests and the two blocking-message tests, and delete
  `only_assets_named_in_the_source_are_copied`; verify with `cargo test`.
- [ ] 6.5 In `updates.rs`, `settings.rs`, `projects.rs`, `components.rs`, `sidecar.rs`,
  `project_activity.rs`, `approvals.rs` and `recent.rs`: merge the pairs listed in the scan into
  table tests, and keep one `a_project_from_a_newer_app_is_skipped_and_unchanged`, moved to
  `projects.rs` next to `read_each`; verify with `cargo test`.

## 7. Frontend tests

- [ ] 7.1 In `src/protocol`, `src/lib`, `src/components/{chat,documents,shell}`: delete
  `eventStore.test.ts` "adds and removes reactions" and "ignores unknown payload fields", make
  "skips unknown event types" use a made-up type, merge its two full-replay tests; delete
  `conversationStatus.test.ts`, `quarto.test.ts`'s copy-text test and `outline.test.ts` "is empty for
  an empty Conversation"; merge the pairs in `names.test.ts`, `WorkflowProgress.test.ts`,
  `qmd.test.ts` and `updateLabel.test.ts`; verify with `npm test`.
- [ ] 7.2 In `src/components/{interactive,overview,home,avatar}`: merge the three "no renderer
  shows the text" tests into one in `InteractiveComponent.test.tsx`; merge `chart-plot.test.ts`
  into `chart-model.test.ts`; test `sortRows` directly and remove `TableView`'s `initialSorting`
  prop; delete `chart.test.tsx`'s reference-button test, `approval.test.tsx`'s second test and
  `overview.test.ts` "shows six, then all"; merge the pairs in `overview.test.ts`,
  `gesture.test.ts`, `sequence.test.ts` and `palette.test.ts`; verify with `npm test`.

## 8. Sidecar tests

- [ ] 8.1 Add `sidecar/tests/conftest.py` with `FakeLink`, `FakeContext` and `ECHO`, and use them
  in place of the copies; verify with `uv run pytest`.
- [ ] 8.2 Delete the model-call tests: `test_decide.py` (and `decide.py`'s `make_chat` parameter),
  `test_debug.py` replaced by one test of `Recorder.model_call`, the 4 `structured_answer` tests in
  `test_providers.py`, the 2 `_test_model` tests in `test_summary.py`, the `_converse` tests in
  `test_prompt_rounds.py` (its two tests without a model move to `test_tools.py`, then the file
  goes), and `test_draft.py` except its two cancellation tests; verify with `uv run pytest`.
- [ ] 8.3 Delete the trivial tests (the three prompt-text tests, the two "without an id is
  ignored" tests, `test_every_call_says_it_serves_agricultural_research`,
  `test_a_content_filter_or_refusal_ending_is_recognised`, `test_plan_parses_entries_by_kind`);
  move `test_routing.py`'s `test_join_data_gets_no_fallback_table` to `test_tables.py` and
  `test_hand_offs.py`'s `_material` test to `test_prompt_turns.py`, dropping its `_offered` duplicate;
  rewrite `test_a_state_that_cannot_be_read_fails_to_resume` with `pytest.raises`; verify with
  `uv run pytest`.
- [ ] 8.4 Delete `scripts/third-party-lib.test.mjs`'s `isLicenseFile` test; verify with
  `npm test`.

## 9. Check

- [ ] 9.1 Run all three suites, write the new counts under "Counts" next to the baseline, and
  check every remaining test name still says what it checks; verify all suites pass.

## Counts

| Suite | Before | After |
|---|---|---|
| `cargo test` | 306 (298 passed, 8 ignored) | |
| `npm test` | 178 passed (49 files) | |
| `uv run pytest` | 138 passed | |

## Workflow follow-up

- Archive with `/opsx:archive` (no specs to sync), mark Roadmap #24 Done and #25 Next, then open
  the pull request into `dev`.
