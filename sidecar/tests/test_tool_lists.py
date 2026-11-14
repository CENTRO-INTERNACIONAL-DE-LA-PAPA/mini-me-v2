from mini_me_sidecar.adapters import load_adapters
from mini_me_sidecar.tools import TOOL_NAMES


def test_fixed_adapters_use_only_known_tools():
    for adapter in load_adapters().values():
        assert set(adapter.uses_tools) <= set(TOOL_NAMES), adapter.info.id
