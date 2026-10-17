import pandas as pd

from mini_me_sidecar.adapters.data.catalogue import CleanPlan
from mini_me_sidecar.adapters.data.clean import apply_actions


def plan(*actions: dict) -> list:
    return CleanPlan.model_validate({"actions": list(actions)}).actions


def test_mapping_duplicates_and_missing_codes():
    frame = pd.DataFrame(
        {"variety": ["Yungay", "yungay", "yungay", "Canchán"], "yield": ["10", "-", "-", "7"]}
    )
    mapping = [{"old": "yungay", "new": "Yungay"}]
    cleaned, log = apply_actions(
        frame,
        plan(
            {"kind": "map_values", "column": "variety", "mapping": mapping},
            {"kind": "normalize_missing", "values": ["-"], "columns": ["yield"]},
            {"kind": "drop_duplicates", "columns": None},
        ),
    )
    assert [a.changed for a in log] == [2, 2, 1]
    assert list(cleaned["variety"]) == ["Yungay", "Yungay", "Canchán"]
    assert pd.api.types.is_numeric_dtype(cleaned["yield"])
    assert frame["variety"][1] == "yungay"


def test_destructive_and_invalid_actions_are_not_applied():
    frame = pd.DataFrame({"yield": [1, 2, 3, 4]})
    cleaned, log = apply_actions(
        frame,
        plan(
            {"kind": "drop_rows_where", "column": "yield", "operator": ">", "value": 1},
            {"kind": "clip", "column": "yeild", "min": 0, "max": 2},
        ),
    )
    assert len(cleaned) == 4
    assert log[0].note == "Held back: it would drop 75% of the rows"
    assert log[1].note == "Ignored: no column `yeild`"
