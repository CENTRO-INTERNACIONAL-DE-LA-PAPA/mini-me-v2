# Mini-Me 0.5.2

## New

- Rename or delete a Conversation, a Project or a file from the "…" menu next to it.
- A new Conversation gets a name from your first message, so your list reads at a glance. You can rename it any time.
- Documents are rendered with your own copy of Quarto, so you can preview them and export a PDF.

## Improved

- A reply that is being written keeps scrolling with it while you are at the bottom of the Conversation.
- Typing `#` tells apart files that share a name.
- Saving a document, and the Quarto setting, no longer depend on Quarto being installed.

## Fixed

- A new file is no longer shown as removed, and renaming is quieter.
- A Project is renamed correctly while it is open, and a file can no longer be given an empty name.
- Documents that try to read files outside their own folder are refused.
- Your API keys are kept on Linux.
- Mini-Me no longer starts its background runtime twice when working with data.
