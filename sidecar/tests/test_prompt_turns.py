from mini_me_sidecar.adapters.prompt import (
    FILES_RULE,
    REPLY_RULE,
    RESEARCH_CONTEXT,
    _filtered,
    _material,
    _offered,
    _merged,
    _system_prompt,
    _tools_error,
    _turns,
)
from mini_me_sidecar.context import Model


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
    assert alone == (
        f"You are Scribe, a Mini-Me. {RESEARCH_CONTEXT} {REPLY_RULE} {FILES_RULE}\n\nSummarize."
    )


def test_every_call_says_it_serves_agricultural_research():
    assert _system_prompt(None, False, "Design an experiment.").startswith(RESEARCH_CONTEXT)
    assert RESEARCH_CONTEXT in _system_prompt("Experimenter", True, "Design an experiment.")


def test_a_content_filter_or_refusal_ending_is_recognised():
    assert _filtered({"finish_reason": "content_filter"})
    assert _filtered({"stop_reason": "refusal"})
    assert not _filtered({"finish_reason": "stop"})


def test_the_conversations_files_and_components_are_listed_without_content():
    results = {
        "assets": [
            {"id": "a1", "name": "notes.txt", "current": True},
            {"id": "a2", "name": "trial.csv", "current": False},
        ],
        "components": [{"id": "c1", "kind": "table", "author": "Curator"}],
    }
    material = _material("summarize #notes.txt", results)
    assert material.startswith("summarize #notes.txt\n\nFiles in this Conversation:")
    assert "- notes.txt (ID: a1) — in this message" in material
    assert "- trial.csv (ID: a2)\n" in material
    assert material.endswith("- table from Curator (ID: c1)")
    assert _material("hello", {"assets": [], "components": []}) == "hello"
    picked = _material("summarize the trial", results, None, None, {"asset_id": "a2"})
    assert "- trial.csv (ID: a2) — probably the file the user means" in picked


def test_suggest_edit_is_offered_only_in_a_thread_and_edit_document_only_outside():
    listed = ("save_file", "suggest_edit", "edit_document")
    defaults = ["read_file", "read_component", "hand_off"]
    assert _offered(listed, in_thread=False) == [*defaults, "save_file", "edit_document"]
    assert _offered(listed, in_thread=True) == [*defaults, "save_file", "suggest_edit"]


def test_a_comment_comes_after_the_passage_it_is_about():
    document = {"asset_id": "d1", "name": "Report.qmd", "passage": "Yield fell above 3,800 m."}
    material = _material("make this shorter", {"assets": [], "components": []}, None, document)
    assert material == (
        "This comment is about a passage of the document Report.qmd (ID: d1), which read_file "
        'reads in full:\n"""\nYield fell above 3,800 m.\n"""\n\nmake this shorter'
    )


def test_the_messages_references_are_listed_with_their_kind():
    table = {"id": "c1", "kind": "table", "author": "Curator", "current": True}
    chart = {"id": "c2", "kind": "chart", "author": "Plotter", "current": True}
    results = {"assets": [], "components": [chart, table]}
    message = {
        "text_components": [
            {"kind": "component", "id": "c1", "label": "$trial"},
            {"kind": "component", "id": "c2", "label": "$Yield-by-variety"},
            {"kind": "mini_me", "id": "scribe", "label": "@Scribe"},
        ]
    }
    material = _material("summarize these", results, message)
    assert "- table from Curator (ID: c1) — in this message" in material
    assert material.endswith(
        "read_component:\n"
        "- $trial: the table with ID c1\n"
        "- $Yield-by-variety: the chart with ID c2"
    )


def test_a_model_without_tool_calling_gets_its_own_error():
    model = Model(provider="openrouter", model="some/model")
    error = _tools_error(Exception("No endpoints found that support tool use"), model)
    assert error is not None and error.code == "tools_unsupported"
    assert "some/model" in str(error)
    assert _tools_error(Exception("rate limited"), model) is None
