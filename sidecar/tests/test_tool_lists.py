import json
from pathlib import Path

from mini_me_sidecar.adapters import load_adapters
from mini_me_sidecar.tools import MODEL_TOOL_NAMES, TOOL_NAMES

LIBRARY = Path(__file__).parents[2] / "src-tauri" / "library" / "builtin.json"


def traits() -> list[dict]:
    return json.loads(LIBRARY.read_text(encoding="utf-8"))["traits"]


def test_every_listed_tool_is_known_and_prompt_traits_list_only_model_tools():
    for definition in traits():
        tools = definition.get("tools", [])
        assert set(tools) <= set(TOOL_NAMES), definition["name"]
        if definition["adapter"] == "prompt":
            assert set(tools) <= set(MODEL_TOOL_NAMES), definition["name"]


def test_fixed_adapters_use_exactly_the_tools_their_traits_list():
    adapters = load_adapters(test_adapters=False)
    for definition in traits():
        adapter = adapters.get(definition["adapter"])
        if adapter is None or definition["adapter"] == "prompt":
            continue
        assert set(definition.get("tools", [])) == set(adapter.uses_tools), definition["name"]
