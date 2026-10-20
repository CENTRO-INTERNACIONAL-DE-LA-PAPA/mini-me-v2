# Using Mini-Me

How to ask Mini-Mes for help and what to expect from them. Setting up an AI provider and
the Ai2 and Typesafe accounts is described in the README's
[Getting started](../README.md#getting-started), and what each service receives in
[What leaves your computer](../README.md#what-leaves-your-computer).

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
Mini-Mes read CSV, TSV and Excel (`.xlsx`) tables; PDFs and images are not read yet.

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
