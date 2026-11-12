from mini_me_sidecar.adapters.asta import FindPapers, Theorize
from mini_me_sidecar.adapters.base import Adapter, AdapterInfo
from mini_me_sidecar.adapters.data import CleanData, JoinData, PlotData, ProfileData, ValidateData
from mini_me_sidecar.adapters.dataverse import SearchDataverse
from mini_me_sidecar.adapters.echo import Echo
from mini_me_sidecar.adapters.prompt import Prompt

__all__ = ["Adapter", "AdapterInfo", "load_adapters"]


def load_adapters() -> dict[str, Adapter]:
    adapters: list[Adapter] = [
        Echo(),
        Prompt(),
        FindPapers(),
        Theorize(),
        ProfileData(),
        ValidateData(),
        CleanData(),
        JoinData(),
        PlotData(),
        SearchDataverse(),
    ]
    by_id: dict[str, Adapter] = {}
    for adapter in adapters:
        if adapter.info.id in by_id:
            raise ValueError(f"two adapters share the ID {adapter.info.id!r}")
        by_id[adapter.info.id] = adapter
    return by_id
