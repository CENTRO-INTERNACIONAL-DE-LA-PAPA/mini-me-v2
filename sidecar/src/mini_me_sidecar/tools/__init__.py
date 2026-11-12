"""Tool names. Tools act only through requests to the core, so its checks apply to all of them;
submodules are imported where used, since the table tools load pandas."""

# Every tool a Trait definition may list; `src-tauri/src/library.rs` knows the same names.
TOOL_NAMES = (
    "read_file",
    "read_table",
    "read_component",
    "hand_off",
    "save_file",
    "write_document",
    "suggest_edit",
    "edit_document",
    "show_table",
    "show_chart",
    "show_papers",
    "show_theories",
    "show_datasets",
)

# Offered to every prompt-based Trait's model, so Traits do not list them.
DEFAULT_TOOLS = ("read_file", "read_component", "hand_off")

# The tools with a form for models, which a prompt-based Trait may list.
MODEL_TOOL_NAMES = ("save_file", "show_table", "write_document", "suggest_edit", "edit_document")

# Offered only to a call answering a comment thread, whose passage it changes.
THREAD_TOOLS = ("suggest_edit",)

# Offered only outside a comment thread, where a document is edited by quoting its passages.
CONVERSATION_TOOLS = ("edit_document",)
