# Tasks

## 1. Rust core: ask Jev which file

- [x] 1.1 In `link.rs`, add `files: Vec<RouteFile { id, name }>` to `CoreFrame::RouteStart`
  and `file: Option<RunFile { asset_id, name }>` to `RunContext`; pass `files` through
  `Runs::route`
- [x] 1.2 In `routing.rs` `route()`, list the Conversation's Assets with
  `history::results()`, and add `file` to `ask` with those options when the message
  references and attaches no Asset and the list is not empty
- [x] 1.3 In `decide()`, add `file: Option<AssetRef>` to `Decision`: the offered Asset Jev
  chose at or above the threshold, and `None` for `none`, a lower confidence, an unknown ID
  or no answer
- [x] 1.4 Add `file` to `RunSpec`, set it from the decision in `start_reply()` (`None` for
  comment threads), and send it as `plan.context.file`
- [x] 1.5 Rust unit tests: `decide()` picks the file at the threshold and drops `none`, low
  confidence and unknown IDs; a tagged message sends no `file` question; a Conversation
  without files sends none

## 2. Sidecar: the `file` question and the picked file

- [x] 2.1 In `routing.py` `_questions()`, build the `file` Choice from `frame["files"]`:
  each file's ID described by its name, plus `none`
- [x] 2.2 In `context.py`, read `context.file` into `CallContext.file`
- [x] 2.3 In `adapters/data/replies.py`, give `read_tables()` a fallback when the message
  points to no table: the picked file if it is a table file, else the newest table file of
  `ctx.results()`; write a line naming the file and why before the Trait's output; Join Data
  calls it with the fallback off
- [x] 2.4 In `adapters/prompt.py`, mark the picked file in "Files in this Conversation" as
  the file the user probably means
- [x] 2.5 pytest tests in `sidecar/tests/`: the fallback picks the picked table, then the
  newest table, skips a picked non-table, fails with no table, and stays off for Join Data;
  `_questions()` builds the `file` Choice with `none`

## 3. Reactions

- [x] 3.1 Add 🤔 (puzzled by a result or unsure whether something is right), 😮 (surprised
  by a result), 💪 (determined, or encouraging the Mini-Me to keep going) and 🌱 (planting,
  seedlings, sprouting or the start of a field season), 😅 (admits a mistake or laughs at a
  setback), 🙏 (apologizes or asks for patience), ☕ (mentions a break, coffee or a long
  day), 🧪 (running an experiment or lab work) and 🌧️ (rain, drought or weather affecting
  the field) to `REACTIONS` in `routing.rs` and to the described options in `routing.py`,
  and close the quote in the 🥔 description
- [x] 3.2 In `decide()`, keep a confident reaction only when a random draw passes a
  one-in-two chance; take the draw from a fresh UUIDv7's random bits, so no new dependency
  is needed, and pass it into `decide()` so tests can fix it
- [x] 3.3 Rust unit tests: a confident reaction is kept when the draw passes and dropped
  when it does not

## 4. Developer view

- [x] 4.1 In `MessageItem.tsx`'s [DEBUG] Jev block, show the `file` answer's options by file
  name, fetching the Project's file names only when Jev answered `file`

## 5. Spec and checks

- [x] 5.1 `cd src-tauri && cargo test`, `npm test` and `cd sidecar && uv run pytest` pass
- [x] 5.2 In the app: "@Curator #field-trial.csv remove duplicate rows", then
  "@Validator check the cleaned data" validates `field-trial-cleaned.csv` and names it
- [x] 5.3 In the app: after a message tagging `harvest.csv`, "@Plotter compare average
  yield by variety" plots `harvest.csv`; "@Validator check #field-trial.csv" still checks
  the tagged file
- [x] 5.4 In the app: "wow, I didn't expect yield to drop that much" gets a 😮 reaction

## Workflow follow-up

- Open a follow-up issue for Jev picking an Interactive Component ("that chart").
- Archive the change with `/opsx:archive`, syncing the delta specs into `openspec/specs/`.
