# Tasks

## 1. Library data

- [x] 1.1 Change the colours of *Summarize*, *Assist*, *Find Papers* and *Theorize* to the bright fills in design.md. Verify: the diff shows only their `color` values changed.
- [x] 1.2 Add *Scout*, *Refute*, *Plan*, *Wonder* and *Experiment* to `src-tauri/library/builtin.json` with adapter `prompt`, the IDs, colours and instructions from design.md, and no components. Verify: the file parses and the names are in Title Case (task 2.1's test).
- [x] 1.3 Add the placeholder Traits *Document*, *Explore Dataverse*, *Code*, *Collect Data*, *Model*, *Predict* and *Index Sources* with adapter `echo`, `instructions: null`, the IDs and colours from design.md, and the descriptions from the README Traits table. Verify: task 2.1's test.
- [x] 1.4 Add the Mini-Mes Explorer, Skeptic, Planner, Inquirer and Experimenter, each with the description from the spec, the colours from design.md and a one-Step Workflow running its Trait. Verify: task 2.1's test.

## 2. Tests

- [x] 2.1 Update `library.rs` tests: the built-in Trait names in order, every non-Asta Trait listing no components, each new Mini-Me running its Trait through `prompt`, the placeholders using `echo`, and a new check in `problems()` that no Mini-Me's Step references an `echo` Trait. Verify: the user runs `cd src-tauri && cargo test library` and it passes.

- [x] 2.2 In the `prompt` adapter, add the sentence telling the model to start with its answer to the system prompt, after "You are <name>, a Mini-Me." and also when there is no name. Verify: the user sends "@Skeptic the sky is blue" and the reply has no title restating the request.

## 3. Docs

- [x] 3.1 README Traits section: say the tables show some of the built-in Traits and the library will hold more; list the Data Lifecycle Traits by stage in place of *Analyze Data*; fix the *Code* description ("An assistant…"). Verify: the user reviews the diff.
- [x] 3.2 README Roadmap: #9 scope as built; add #10 "Data Traits: inspect and prepare" (with the table Interactive Component) and #11 "Data Traits: explore and explain"; drop the separate Tables row and renumber Editors, Document mode, Charts and Project Overview. Verify: the user reviews the diff.
- [x] 3.3 README "Asking a Mini-Me": replace the per-Mini-Me list with a general paragraph (type `@` to see them; what they need; what files they read), so adding a Mini-Me needs no README edit. Verify: the user reviews the diff.

## 4. Verification

- [x] 4.1 The user runs the app with `npm run tauri:dev`, checks that `@` offers the nine Mini-Mes and no placeholder, and sends one message to each new Mini-Me (with an AI model set in Settings). Verify: each answers in line with its spec scenario.
- [x] 4.2 The user sends "Design an experiment to test whether early planting reduces late blight" with no mention. Verify: routing picks Experimenter, or asks the user to choose.

## Workflow follow-up

- Show the README edits to the user before committing.
- Archive the change (`/opsx:archive`), mark #9 "Done" and #10 "Next" in the Roadmap.
