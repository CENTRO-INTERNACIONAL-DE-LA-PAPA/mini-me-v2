# Using Mini-Me

How to ask Mini-Mes for help and what to expect from them. Setting up an AI provider and
the Ai2 and Typesafe accounts is described in the README's
[Getting started](../README.md#getting-started), and what each service receives in
[What leaves your computer](../README.md#what-leaves-your-computer).

## A Project's Overview

Opening a Project shows its **Overview**: when it was last active, how many Conversations it
has, a summary, a featured output and the latest outputs. **Update summary** asks the AI
model chosen in Settings for a short summary of what the Project has found and what is still
open. It sends the text of the Project's messages, newest Conversations first, to that
model's provider, never file contents, and only when you click it; the summary then stays
until you update it again. To feature a chart or table, click the pin in its header in a
reply; the Overview shows it large, and the pin or the × on the Overview removes it. Latest
outputs lists the tables, charts, papers, theories and files Mini-Mes made, six at first
and all with **Show all**; a card opens the reply it came from.

## Asking a Mini-Me

Type `@` in the message box to pick a Mini-Me; the one you mention first answers. Mini-Me
comes with predefined Mini-Mes, and typing `@` lists them under Thinking, Literature and
Data, each with a short description. Keep typing to narrow the list by name, move through
it with the arrow keys, and press Enter or Tab to pick one. A picked Mini-Me shows in its
colour in the message box and acts as one block: the arrow keys step over it, and Backspace
removes it whole. Most Mini-Mes use the AI model chosen in Settings, so they need
an API key and a model. Those built on Asta, Researcher and Theorist, need an Ai2 account
instead.

When you don't mention a Mini-Me, Typesafe's Jev chooses the most suitable one. If Jev isn't
confident enough (see **Confidence threshold** in Settings, 0.5 by default) or can't be
reached, Assistant answers; mention a Mini-Me with `@` to choose one yourself. Jev also
decides whether the Mini-Me reacts to your message with an emoji.

## Formatting

Mini-Mes' replies are formatted: bold and italic text, headings, lists, quotes, code and
tables. Links open in your browser. HTML in a reply is shown as text, and images are shown
as links, so a reply never loads anything from the internet by itself. Your own messages
are shown exactly as you typed them.

## Files

Reference a file with `#` or attach it to a message. Mini-Mes read text files, and the data
Mini-Mes read CSV, TSV and Excel (`.xlsx`) tables; PDFs and images are not read yet. A
document (`.qmd`) opens in Mini-Me's document view rather than another app.

## Documents

A **document** is a report you edit in Mini-Me and keep in the Project's Files, as a Quarto
(`.qmd`) file that Quarto, RStudio and other editors also open. To start one, pick **Report**
next to Outline and Jobs in a Conversation:

- **Draft from this conversation** creates a document titled after the Conversation and opens
  it while Scribe writes a report from the Conversation's messages, which appears in the
  source as it is written. **Stop** keeps what was written so far. Drafting sends the
  Conversation's messages, never file contents, to the provider of the AI model chosen in
  Settings, and adds nothing to the Conversation.
- **Start blank** creates an empty document, with your name as author when you have set it.
- **Open from Files** lists the Project's documents, most recently edited first.

Documents also open from Files and from the card below a reply in which Assistant or Scribe
wrote one; ask them for a report or a document.

The document view shows the document's Quarto source beside a preview of its pages. Edit the
source as text, including
the title and author in its header; the buttons add bold, italic, headings, quotes and lists,
and changes are saved as you type. The preview shows the pages exactly as **Export PDF** will
make them; click **Render** to update it after editing. **Export PDF** saves a PDF of the
document next to it in Files and offers to open it; both are made on your computer, and code in
the document is shown, never run.

### Comments and suggestions

Select text in the source and click the comment button by the formatting buttons to start a
thread on it. **Comments** shows the document's threads beside it, under **Open** and
**Resolved**, numbered in the order their passages appear; in the source, each passage is
underlined and followed by its number, and clicking either opens the thread. Threads follow
their passages as you edit. One whose passage can no longer be found, for example after the
file was changed in another editor, is listed under **Detached**. Comments are kept in the
Project, not in the `.qmd` file.

A comment is a note unless it @-mentions a Mini-Me. A mentioned Mini-Me runs its whole Workflow,
as it would for a message, with the passage, the document's name and the thread's earlier
comments, and answers in the thread. Mini-Mes whose Traits can suggest edits, such as Assistant
or Scribe, may suggest new text for the passage: the source shows the passage struck through
with the suggestion after it, and the reply offers:

- **Accept and resolve**: puts the suggestion in the document and resolves the thread. If you
  have edited the passage since, your edits are kept and combined with the suggestion; when
  both changed the same words, nothing is applied, and you can discard it or ask again.
- **Discard**: leaves the document as it is.

For another version, @-mention the Mini-Me again in the thread and say what to change.

**Resolve** moves a thread to Resolved, setting aside a suggestion still waiting, and
**Reopen** brings it back. **Delete** removes the thread and its comments.

### Editing a document from a Conversation

Reference a document with `#` or attach it, and ask a Mini-Me whose Traits can edit documents,
such as Assistant or Scribe, to change it ("@Scribe tighten the methods in #Trial report").
The Mini-Me suggests its edits; the document itself is unchanged until you accept them. Each
edit opens a thread on the passage it changes, saying "Opened by Scribe · from Trial design"
with the Conversation's name as a link back, and holding the Mini-Me's reason and its
suggestion, which you accept or discard as above. The reply shows a card for the document with
how many suggested edits still wait; **Open** shows the document with its Comments.

## Follow-ups

When a message follows up on earlier ones ("make it shorter", "what about the second
point?"), the Mini-Me also sees the Conversation's earlier messages, including other
Mini-Mes' replies. Files from earlier messages are known by name only, so reference a file
again to have it read.

## Interactive Components

Cards, theories, tables, charts and similar rich results are **Interactive Components**,
shown below a reply's text. You can sort a table, hover over a chart to see exact values,
hide a series or switch the chart to another type.

Mini-Mes that read the Conversation, such as Assistant, can refer to them in a follow-up
("@Assistant summarize the third paper"). Researcher and Theorist only search, so ask them
for new papers or theories, not about earlier results.

## Data Mini-Mes

Profiler, Validator, Curator, Linker and Plotter work on your tables on your computer.
pandas and pointblank compute every number, check and chart; the AI model only chooses what
to run. Cleaned and joined tables are saved as new files; the original is never changed.

## Mini-Mes with several Steps

Some Mini-Mes work in several Steps. Investigator explores a question, plans, tests its plan
against criticism and then asks for your approval before designing an experiment. Its reply
shows each Step's progress, and while it waits it shows **Approve** and **Reject**; the wait
survives closing the app. **Stop** ends it at any time.

## Checking answers

Answers come from AI models, so check them before relying on them. Theories and paper
summaries come from Ai2's AI: check them against the cited papers.
