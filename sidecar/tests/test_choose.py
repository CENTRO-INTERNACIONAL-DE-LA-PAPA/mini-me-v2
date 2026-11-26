from mini_me_sidecar.adapters.data.catalogue import CleanPlan, StripWhitespace
from mini_me_sidecar.adapters.data.choose import fit_plan
from mini_me_sidecar.adapters.data.templates import ChartPlan

STRIP = {"kind": "strip_whitespace", "columns": None}
MISNAMED = {"kind": "map_values", "columns": ["variety"], "mapping": [{"old": "a", "new": "A"}]}


def test_malformed_entries_are_left_out_with_their_reason():
    plan, malformed = fit_plan(CleanPlan, {"actions": [STRIP, MISNAMED, {"kind": "shout"}]})
    assert plan == CleanPlan(actions=[StripWhitespace(kind="strip_whitespace", columns=None)])
    assert malformed == [
        ("map_values", "no `column` given"),
        ("shout", "no kind `shout`"),
    ]

    plan, malformed = fit_plan(ChartPlan, {"charts": [{"template": "bar"}]})
    assert plan is None
    assert malformed == [("bar", "no `title` given")]

    assert fit_plan(CleanPlan, {"actions": []}) == (CleanPlan(actions=[]), [])
    assert fit_plan(CleanPlan, None) == (None, [])

