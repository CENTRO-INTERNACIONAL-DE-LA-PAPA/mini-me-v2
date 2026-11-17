"""Tool names. Tools act only through requests to the core, so its checks apply to all of them;
submodules are imported where used, since the table tools load pandas."""

# Offered first to every prompt-based Trait's model.
DEFAULT_TOOLS = ("read_file", "read_component", "hand_off")

# The other tools with a form for models, also offered to every prompt-based Trait's model.
MODEL_TOOL_NAMES = ("save_file", "show_table", "write_document", "suggest")
