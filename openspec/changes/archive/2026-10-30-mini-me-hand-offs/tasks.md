# Tasks

## 1. The Mini-Me list in the run

- [x] 1.1 Add `mini_mes: [{ id, name, description }]` to `RunContext` (`link.rs`), filled in
  `Runs::launch` with every Mini-Me of the library; raise the link protocol to 13 on both sides
  and update the fixture and the version test
- [x] 1.2 Remove the per-reply `hand_offs` list from `RunSpec` and `routing.rs`

## 2. The hand-off tool

- [x] 2.1 In the sidecar, read `context.mini_mes` into `CallContext.mini_mes`; add a fixed
  `hand_off` tool with `mini_me` (a name), `request` and an optional `file` (an Asset ID); it
  maps the name to its ID and sends `reply.hand_off { mini_me_id, request, asset_id }`
- [x] 2.2 Offer `hand_off` on every call as a default tool, and list the Mini-Mes in the prompt
  under "Mini-Mes you can hand off to"
- [x] 2.3 pytest: a name maps to its ID and an unknown one is refused with the valid names; the
  tool is offered with no Trait tools listed; the prompt lists the Mini-Mes

## 3. Accepting the hand-off

- [x] 3.1 In `runs.rs`, answer `reply.hand_off`: refuse with `hand_off_not_allowed` a second
  hand-off, the reply's own Mini-Me, a Mini-Me not in the library, a reply that answers a
  Mini-Me's message, a comment thread, and a file not of the Conversation; otherwise hold it on
  the `Run`
- [x] 3.2 Add the `hand-off` component on acceptance with `add_core_component`, and add
  `hand-off` to `CORE_KINDS`
- [x] 3.3 Remove the hand-off text appended to the reply: `Ending`, Text Components on
  `message.completed` and their UI handling; `complete_reply` keeps returning the completed reply

## 4. Starting the hand-off reply

- [x] 4.1 On `run.done` with a held hand-off, start the chosen Mini-Me's run from `runs.rs` after
  completing the reply, with the handed file as the picked file
- [x] 4.2 Rust unit tests: each refusal; acceptance adds the card; a completed reply starts the
  other Mini-Me with the request as input and the file as `context.file`; a cancelled run starts
  nothing; `run.start` carries every Mini-Me in `context.mini_mes`

## 5. The card in the UI

- [x] 5.1 Add a `hand-off` version 1 renderer: the Mini-Me's pill, the request, and the file as a
  reference chip that opens it; register it in the catalogue
- [x] 5.2 Frontend test: the card shows the Mini-Me, the request and the file
- [x] 5.3 Place each component by its Step, whatever the reply's status (`componentPlaces`): it
  shows once its Step has finished, with that Step until the reply ends; then the last Trait
  Step's and Step-less ones show under the reply; a waiting approval shows under the reply

## 6. Checks

- [x] 6.1 `cd src-tauri && cargo test`, `npm test` and `cd sidecar && uv run pytest` pass
- [x] 6.2 In the app: "@Assistant what's in #field-trial.csv? Ask Profiler to profile it" shows
  a hand-off card on Assistant's reply, then Profiler's profile of `field-trial.csv`
- [x] 6.3 In the app: "find papers on late blight and plot #harvest.csv" sent to Assistant
  hands off one part and shows the card
- [x] 6.4 In the app: "@Skeptic the sky is blue" gets one reply and no hand-off

## Workflow follow-up

- Archive the change with `/opsx:archive`, syncing the delta specs into `openspec/specs/`.
