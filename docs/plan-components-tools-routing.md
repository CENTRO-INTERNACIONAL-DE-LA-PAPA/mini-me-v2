# Plan: Components, tools and Jev

The aim is to normalize how Mini-Me works, the way a UI reuses one Button with different
parameters: a few building blocks that every Mini-Me shares, each configured by where it is used,
without turning any of them into a do-anything block.

The plan is built as five OpenSpec changes, in order:

1. **Components from files**: hidden files, component previews and sources, history lines,
   removing `$` (done).
2. **Shared tools**: Traits no longer list tools; every Mini-Me's model is offered every tool
   (done).
3. **Suggestions and comments**: one suggestion tool, and comments that work like the chat
   (done).
4. **Jev hints**: Trait names in Jev's Mini-Me options, and Jev's component and tools hints
   (done).
5. **Hand-off chains**: `next_mini_me`, hand-offs made by the core, the Traits a call
   comes before, and chains (done).

## Files (Assets)

- The layout doesn't change: `assets/<id>/<name>`. A file is identified by its ID; the name is a
  label stored for that ID. Opening a file still uses the system's default app, so a user can edit
  a file in Excel and the next Mini-Me reads the edited version.
- Because files can change outside the app, the core refreshes a file's size and modification
  time when it lists or reads the file.
- New **hidden** flag. Hidden means hidden from the user only. Hidden files are left out of:
  - the Files screen;
  - the `#` list in the composer;
  - the Outline panel;
  - the Overview's latest outputs;
  - attachments on replies.

  Traits and Jev see them like any other file of the Conversation, and the data Traits'
  fallback to the newest table skips them.

## Interactive Components

- Every component has the same shape: `{ id, kind, version, source_asset_id, preview, text }`.
  Its `kind` decides how the UI shows it.
- **The file is the source of truth for the data.** `preview` (today's `data`) is only what the
  chat shows, kept so earlier replies stay as they were, even after their file changes.
- When a model shows rows it wrote itself, the core first saves them as a file, so every table
  and chart has a source file.
- **read_component** returns the component's kind, text and source file ID, not its preview. Full
  data always comes from **read_file**.
- Components with no source file (approval, hand-off, suggestion, document) keep their content
  in the component as today. They hold nothing a model needs, so their history line is enough.
- **Provider Traits** (Find Papers, Theorize, Search CIP Dataverse) show their component as their
  output. Their results are saved as hidden JSON files, the component's source. Their show tools
  (show_papers, show_theories, show_datasets) are no longer tools, so only these Traits can show
  papers, theories or datasets.

## Chat history sent to models

A component's text is no longer added to its message in the history. Instead, the message gets
one short line per component with its kind, its title or source file, and its ID, for example:

- `[table from field-trial-cleaned.csv, id 0196…]`
- `[chart "Yield by variety" from field-trial.csv, id 0196…]`

The model reads a component with read_component when it needs it.

## References

- `$` is removed: no `$` typing or list, no component naming rules, and no special `$` handling
  in the tools.
- There is no reference button and no chip for a component: the user describes a table or
  chart in words, and the model finds it among the Conversation's components by their history
  lines.

## Tools

- Tools no longer belong to Traits. Every tool with a form for models is offered to every
  Mini-Me's model on every call, and the Trait editor loses its tool list.
- Adapter-coded Traits (data Traits, Asta, Dataverse) keep calling their tools in code. Showing
  a chart stays the Plot Trait's job.
- Jev marks the 4 tools most likely to help, from its answer's probabilities, and the model's
  request says so ("Likely useful: …"). The model can still use any tool. Hand-off is not one of
  the options, since `next_mini_me` gives that hint.

## Suggestions

- A suggestion is its own thing, separate from comments: a proposed replacement of a passage of
  a document, with its author.
- One tool, `suggest(document_id, find, text)`, replaces suggest-an-edit and edit-a-document. It
  can be called from any reply, in the chat or in a comment thread. The author is the Mini-Me
  whose reply made the call; the model does not pass it.
- A suggestion does not record where it was made (which thread or chat message).
- Suggestions show inline in the document, the passage struck through with the new text after
  it, and the user accepts or discards each one there. Nothing changes the document until the
  user accepts.
- The `document-edits` card is removed. A reply that made suggestions shows the document's plain
  `document` card (title and Open). There is no badge counting waiting suggestions.

## Comments

- Comments exist only in the document view. The user selects a passage and writes a comment;
  replies form a thread under it.
- A comment works like a message in the chat: with an `@` the mentioned Mini-Me answers;
  without one, Jev picks the Mini-Me, and Assistant answers when Jev cannot.
- There are no private notes: every comment gets a reply.
- Jev routes a comment without the `file` question: the thread's document is already the reply's
  context.
- A Mini-Me answering in a thread calls the suggestion tool when it wants to change the document,
  and can hand off as in the chat; the other Mini-Me answers next in the same thread.

## Traits

A Trait stays one ability: instructions, a model and an adapter (the prompt adapter or a
provider adapter).

## Jev

One request per message, with these questions:

| Question | When | Use |
|---|---|---|
| `mini_me` | No tagged Mini-Me | Decision: who answers. Below the threshold, Assistant answers |
| `reaction` | Always | Applied directly (cosmetic) |
| `needs_context` | Always | Hint to the Trait calls |
| `file` | No file tagged and the Conversation has files | Hint: "the user probably means X" |
| `component` | The Conversation has tables or charts | Hint, like `file`: marked in the model's list of components |
| tools | Always | Hint: the most probable tools |
| `next_mini_me` | Always | Who should handle the part of the request the answering Mini-Me doesn't cover, or `none` |

- Jev reads each Mini-Me option as its description plus the names of its Traits. The Trait
  names are added automatically, so a Mini-Me with a vague description is still described by
  what it can do.
- `file`, `component` and tools are not asked for a comment: the thread's document is the
  reply's context.
- A `next_mini_me` equal to the answering Mini-Me counts as `none`.
- Several files or components in one message are out of scope for now.
- Jev's picks are not read into the model's request in advance. The model reads files and
  components itself with the read tools.

## Hand-off

A hand-off is a Mini-Me's decision, once per reply, that another Mini-Me should continue after
it. It reaches the core as a request (`reply.hand_off`, as today), made in one of two ways,
depending on the Mini-Me:

- **A Mini-Me whose Traits use a model** decides through its model, with the hand-off tool:
  on its own judgment, for example because of something it finds mid-task, or following Jev's
  recommendation in its context.
- **A Mini-Me whose Traits don't use a model** (for example, Researcher runs only Find Papers)
  can't decide on its own. When Jev recommends a hand-off, the core makes the hand-off for
  it, with the reply's input as the request and the message's file or Jev's file pick.

Each model call is told which Traits its Mini-Me's Workflow can still run after it, so it doesn't
hand off work a later Step will do. For example, in Find Papers → Summarize → Make report, the
Summarize call is told that Make report comes next, so "make a report" in the message is not a
reason to hand off. With conditions or loops, it lists every Trait the Workflow can still reach.

Jev's recommendation: when `next_mini_me` names another Mini-Me above the threshold, the core
passes it to the run as `context.hand_off`, the same way it passes `context.file`. A Mini-Me
whose Traits use a model gets a line in its model's context telling it to hand off to that
Mini-Me with the hand-off tool.

What the core does with a hand-off:

- A Mini-Me hands off to at most one other Mini-Me per reply. In a Workflow with several Traits
  that use a model, the tool is available to each of them; the first hand-off made during the
  reply is the Mini-Me's, and the core refuses any later one.
- The other Mini-Me starts after the whole reply completes, so a hand-off goes to another
  Mini-Me after the whole Workflow, never to a Step. A Mini-Me whose Workflow already covers the
  request gets `none` from Jev, because its Traits are in its description.
- Chains are allowed: Jev is asked again for every handed-off reply, with the hand-off's request
  as the message, and each Mini-Me in the chain decides for itself whether to hand off again.
  Loops are not prevented for now.


---

Drafted with Claude Code (generative AI) from a planning conversation. Review it before using it
as a basis for OpenSpec changes.
