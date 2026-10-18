from mini_me_sidecar.adapters.prompt import REPLY_RULE, _filtered, _merged, _system_prompt, _turns


def test_earlier_step_outputs_come_after_history_and_before_the_material():
    history = [("human", "earlier question"), ("ai", "earlier answer")]
    steps = [{"step_id": "refute", "name": "Refute", "output": "The plan ignores rainfall."}]
    turns = _turns("Plan.", history, steps, "late blight trial")
    assert [role for role, _ in turns] == ["system", "human", "ai", "human", "human"]
    assert "--- Refute ---\nThe plan ignores rainfall." in turns[3][1]
    merged = _merged(turns)
    assert merged[-1][1].index("--- Refute ---") < merged[-1][1].index("late blight trial")


def test_without_earlier_steps_the_turns_are_unchanged():
    history = [("human", "earlier question"), ("ai", "earlier answer")]
    turns = _turns("Summarize.", history, [], "field notes")
    assert turns == [("system", "Summarize."), *history, ("human", "field notes")]


def test_a_later_step_is_told_it_is_part_of_a_workflow():
    prompt = _system_prompt("Investigator", True, "Design an experiment.")
    assert "one Step of Investigator's Workflow" in prompt
    assert prompt.endswith("Design an experiment.")
    alone = _system_prompt("Scribe", False, "Summarize.")
    assert alone == f"You are Scribe, a Mini-Me. {REPLY_RULE}\n\nSummarize."


def test_a_content_filter_or_refusal_ending_is_recognised():
    assert _filtered({"finish_reason": "content_filter"})
    assert _filtered({"stop_reason": "refusal"})
    assert not _filtered({"finish_reason": "stop"})
