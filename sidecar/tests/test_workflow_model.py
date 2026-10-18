from mini_me_sidecar.workflow.model import (
    EARLIER_BUDGET_CHARS,
    Entry,
    final_steps,
    parallel_output,
    parse_steps,
    visible_outputs,
)

INVESTIGATOR = parse_steps([
    {"id": "open-up", "type": "parallel", "branches": [
        {"label": "Directions", "steps": [{"id": "scout", "trait": "s"}]},
        {"label": "Questions", "steps": [{"id": "wonder", "trait": "w"}]}]},
    {"id": "plan", "trait": "p"},
    {"id": "stress-test", "type": "loop", "question": "Again?", "max_iterations": 2,
     "steps": [{"id": "refute", "trait": "r"}, {"id": "revise", "trait": "p"}]},
    {"id": "testable", "type": "condition", "question": "Testable?", "branches": [
        {"label": "testable", "steps": [
            {"id": "ask", "type": "approval", "prompt": "Go on?"},
            {"id": "experiment", "trait": "e"}]},
        {"label": "not testable", "steps": [{"id": "more-questions", "trait": "w"}]}]},
])


def test_only_steps_nothing_can_follow_are_final():
    assert final_steps(INVESTIGATOR) == {"experiment", "more-questions"}
    assert final_steps(parse_steps([{"id": "summarize", "trait": "s"}])) == {"summarize"}
    assert final_steps(INVESTIGATOR[:3]) == set()


def test_parallel_output_puts_each_branch_under_its_label():
    joined = parallel_output([("Directions", "A"), ("Questions", None), ("More", "B")])
    assert joined == "## Directions\n\nA\n\n## More\n\nB"
    assert parallel_output([("Directions", None)]) is None


def trait(step_id: str, output: str, scope: dict[str, str] | None = None) -> Entry:
    return Entry(step_id, step_id.capitalize(), output, "", scope or {}, trait=True)


def test_parallel_branches_do_not_see_each_other_but_later_steps_see_both():
    log = [
        trait("scout", "directions", {"open-up": "Directions"}),
        trait("wonder", "questions", {"open-up": "Questions"}),
    ]
    in_questions = visible_outputs(log, {"open-up": "Questions"})
    assert [e["name"] for e in in_questions] == ["Wonder"]
    after = visible_outputs(log, {})
    assert [e["output"] for e in after] == ["directions", "questions"]


def test_earlier_outputs_keep_the_newest_within_the_budget():
    half = "x" * (EARLIER_BUDGET_CHARS // 2)
    log = [trait("first", half), trait("second", half), trait("third", "short")]
    assert [e["step_id"] for e in visible_outputs(log, {})] == ["second", "third"]
