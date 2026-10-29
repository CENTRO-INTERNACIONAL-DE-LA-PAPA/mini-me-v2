"""Tools: the actions a Trait takes while it runs, such as saving a file or showing a table.
An adapter's code calls them directly; the `prompt` adapter also offers some of them to its
model (`mini_me_sidecar.tools.model`). Every tool acts only through the call's requests to the
core, so the core's checks and Project-folder confinement apply to all of them.

This module only names the tools. Its submodules are imported where they are used: the table
tools load pandas, which most calls never need."""

# Every tool a Trait definition may list; `src-tauri/src/library.rs` knows the same names.
TOOL_NAMES = (
    "read_file",
    "read_table",
    "read_component",
    "save_file",
    "write_document",
    "show_table",
    "show_chart",
    "show_papers",
    "show_theories",
)

# Offered to the model of every prompt-based Trait, which therefore does not list them.
READ_TOOLS = ("read_file", "read_component")

# The tools with a form for models, which a prompt-based Trait may list.
MODEL_TOOL_NAMES = ("save_file", "show_table", "write_document")
