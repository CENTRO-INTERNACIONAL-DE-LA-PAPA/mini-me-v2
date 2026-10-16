# Design

## Context

Traits and Mini-Mes are data in `src-tauri/library/builtin.json`, embedded into the Rust
core and checked by `library.rs` (unique IDs, Title Case names, one Step per Mini-Me,
known Trait per Step). The `prompt` adapter runs any Trait from its instructions: it
prefixes "You are <Mini-Me>, a Mini-Me.", adds the message, the text Assets it references
and, when routing says so, earlier turns. Routing (`routing.rs`) offers Jev only the
Mini-Mes from `Library::summaries()`, and the UI lists only Mini-Mes. A Trait that no
Mini-Me uses therefore can't be reached.

## Goals / Non-Goals

**Goals:**
- Add the five Traits and Mini-Mes as library data only, with no new code path.
- Write instructions that keep each Trait to one task and stop it inventing sources or
  results.

**Non-Goals:**
- A "not available yet" reply for placeholder Traits: nothing can call them.

## Decisions

### Everything is library data
The new Traits run on the existing `prompt` adapter and the placeholders on `echo`. No
protocol, Rust logic or UI change is needed, only `builtin.json` and the `library.rs`
tests. The alternative, dedicated adapters per Trait (for example, structured
output for *Plan*), would add code for no visible gain until Interactive Components exist
for these answers.

### Replies start with the answer, for every prompt Trait
The `prompt` adapter introduces the Mini-Me by name ("You are Skeptic, a Mini-Me."), and
with that alone models tend to open with a title that restates the request, such as
"Skeptic's response to …". The adapter adds one sentence after the name, telling the model
to start with its answer, with no title, heading or introduction. It lives in the adapter,
not in each Trait's instructions, because it is about how a Mini-Me's reply reads in a
Conversation, which holds for every prompt Trait, including user-made ones later. It is
added even when a call has no Mini-Me name.

### Placeholders run on `echo`
Every Trait needs an adapter the sidecar knows. `echo` is always loaded, needs no secret,
and is harmless if reached by mistake. A dedicated "unavailable" adapter was considered,
but nothing can reach these Traits, and each is replaced when its change builds it. The
`echo` adapter's spec changes from "no built-in Trait uses it" to "only placeholder Traits
use it". IDs stay stable when a placeholder becomes real, so Workflows saved by the
Editors change keep working.

### IDs
Following the existing pattern `5f0c8a2e-6d1b-4b7e-9a43-2c8e1f0d7aNN` for Traits and
`…7bNN` for Mini-Mes:

| Trait | ID suffix | Adapter | Mini-Me | ID suffix |
|---|---|---|---|---|
| Scout | `7a06` | prompt | Explorer | `7b06` |
| Refute | `7a07` | prompt | Skeptic | `7b07` |
| Plan | `7a08` | prompt | Planner | `7b08` |
| Wonder | `7a09` | prompt | Inquirer | `7b09` |
| Experiment | `7a10` | prompt | Experimenter | `7b10` |
| Document | `7a11` | echo | — | |
| Explore Dataverse | `7a12` | echo | — | |
| Code | `7a13` | echo | — | |
| Collect Data | `7a14` | echo | — | |
| Model | `7a15` | echo | — | |
| Predict | `7a16` | echo | — | |
| Index Sources | `7a17` | echo | — | |

(`7a02` is left unused, as it is today.)

### Mini-Me colours
Each family follows DESIGN.md's structure (a tint, a solid and an ink at one hue, generated
in oklch: tint L 0.94 C 0.04, solid L 0.64, ink L 0.45). DESIGN.md's colours are
references, so new families are not registered there. Teal is not used because it is too
close to Assistant. Every ink has at least 5.8:1 contrast on its tint.

| Mini-Me | Family | Tint | Solid | Ink |
|---|---|---|---|---|
| Explorer | blue 250 | `#D8EEFF` | `#3690E3` | `#00579C` |
| Skeptic | brown 55 | `#FFE5D2` | `#BB7B4E` | `#7B461E` |
| Planner | green | `#D9F2E3` | `#2FA36B` | `#1E7A4A` |
| Inquirer | pink 350 | `#FFE1EF` | `#D4599B` | `#8E2461` |
| Experimenter | lime 125 | `#E5F0D4` | `#779B1E` | `#446100` |

### Trait colours are bright fills
DESIGN.md describes a Trait's colour as a bright fill (L 0.74–0.84, C 0.06–0.15) with a
black line glyph on top. The spec and the four existing Traits still use mid-tone solids,
so all Trait colours move to bright fills in this change. Nothing renders Trait colours
yet; the values are ready for Trait icons in the Editors change. DESIGN.md's Trait table
is a reference, so Traits that also appear there (*Summarize*, *Find Papers*, *Plan*)
reuse its fills, and the others get distinct hues:

| Trait | Colour |
|---|---|
| Summarize | `oklch(0.84 0.13 95)` |
| Assist | `oklch(0.8 0.1 190)` |
| Find Papers | `oklch(0.74 0.12 270)` |
| Theorize | `oklch(0.76 0.14 345)` |
| Scout | `oklch(0.78 0.11 230)` |
| Refute | `oklch(0.76 0.15 35)` |
| Plan | `oklch(0.74 0.06 60)` |
| Wonder | `oklch(0.76 0.12 310)` |
| Experiment | `oklch(0.8 0.14 145)` |
| Document | `oklch(0.82 0.08 75)` |
| Explore Dataverse | `oklch(0.78 0.1 210)` |
| Code | `oklch(0.76 0.08 260)` |
| Collect Data | `oklch(0.8 0.12 165)` |
| Model | `oklch(0.76 0.12 325)` |
| Predict | `oklch(0.78 0.13 20)` |
| Index Sources | `oklch(0.82 0.12 115)` |

### Instructions
Each follows *Summarize* and *Assist*: one task, files introduced by name, the language of
the message, no invented references or results. A subject-matter expert should review them
before the Mini-Mes are relied on.

- **Scout:** "You help a researcher decide where to look next. From the topic of the
  user's message and any files that follow it, each introduced by a line with its name,
  suggest a varied set of directions worth exploring: different angles, methods, scales or
  disciplines, not variations of one idea. Give each direction a short title and one or
  two sentences on what it would look into and why it may be worth pursuing. These are
  leads, not hypotheses or conclusions: do not state any of them as a finding. Suggest
  about five to eight unless the user asks for a different number. Write in the language
  of the user's message, and never invent references, numbers or results."
- **Refute:** "You test a statement by arguing against it. Take the statement or claim in
  the user's message and argue, as strongly and fairly as you can, that it is wrong or
  overstated, using only the message, any files that follow it (each introduced by a line
  with its name) and widely established knowledge. Name the weakest points of the
  statement: hidden assumptions, alternative explanations, confounders, gaps in evidence,
  cases where it fails. For each, say what evidence would settle it. Do not argue for the
  statement, and do not invent sources, numbers or results. If you find no strong
  counter-argument, say so plainly. If the message holds no statement to argue against,
  say in one sentence that you need one. Write in the language of the user's message."
- **Plan:** "You plan research projects. For the project or goal in the user's message,
  and any files that follow it (each introduced by a line with its name), write a plan: an
  ordered list of steps, or, when the goal is to build a system, its parts and how they
  connect. For each step, say what it does and what it produces; note which steps depend
  on others and which can run at the same time. List the assumptions you made and the
  decisions the user still needs to take. Keep the plan as short as the goal allows; do
  not carry out the steps. Write in the language of the user's message, and never invent
  references, numbers or results."
- **Wonder:** "You open up a topic with questions. From the topic of the user's message
  and any files that follow it, each introduced by a line with its name, ask open
  questions that would take it further: about mechanisms, context, methods, scale,
  exceptions and consequences. Make each question specific enough that someone could set
  out to research it. Ask, do not answer: give no answers, hypotheses or explanations.
  Ask about eight to twelve unless the user asks for a different number, grouped by theme
  when that helps. Write in the language of the user's message."
- **Experiment:** "You design experiments. For the hypothesis in the user's message, and
  any files that follow it (each introduced by a line with its name), design an
  experiment that tests it. State the hypothesis being tested; the independent and
  dependent variables and how each is measured; the treatments and controls; the
  experimental design (for example, randomized complete block), replication and sample
  size reasoning; the data to collect; how it will be analysed; and which result would
  support or reject the hypothesis. Note the main practical risks and confounders. If the
  message holds no testable hypothesis, propose one, say that you did, and design for it.
  Write in the language of the user's message, and never invent references, numbers or
  results."

## Risks / Trade-offs

- [Jev confuses similar Mini-Mes (Explorer and Inquirer, Planner and Experimenter)] →
  The descriptions name each one's distinct output (directions vs. questions, steps vs.
  experiment design). Below the confidence threshold, the user is asked to choose anyway.
- [The `@` list grows from four to nine] → Acceptable until Workflows let one Mini-Me
  combine several Traits. The data changes will add more, so a grouped or searchable list
  may be needed then.
- [Placeholder Traits look real in the data] → Specs require that no Mini-Me references
  them, and the `library.rs` test checks this.
