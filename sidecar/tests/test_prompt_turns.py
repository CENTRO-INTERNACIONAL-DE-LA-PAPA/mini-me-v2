from mini_me_sidecar.adapters.prompt import (
    FILES_RULE,
    REPLY_RULE,
    RESEARCH_CONTEXT,
    _material,
    _merged,
    _system_prompt,
    _turns,
)


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
    picked = _material("summarize the trial", results, None, {"asset_id": "a2"})
    assert "- trial.csv (ID: a2) — probably the file the user means" in picked
    assert "Likely useful" not in picked


def test_routings_hints_mark_the_component_and_name_the_likely_tools():
    results = {
        "assets": [],
        "components": [
            {"id": "c1", "kind": "chart", "author": "Plotter"},
            {"id": "c2", "kind": "table", "author": "Curator"},
        ],
    }
    material = _material(
        "make it a bar chart",
        results,
        component={"component_id": "c1"},
        tools=["show_table", "save_file"],
    )
    assert "- chart from Plotter (ID: c1) — probably the component the user means" in material
    assert "- table from Curator (ID: c2)\n" in material
    assert material.endswith("Likely useful: show_table, save_file")


def test_a_comment_comes_after_the_passage_it_is_about():
    document = {"asset_id": "d1", "name": "Report.qmd", "passage": "Yield fell above 3,800 m."}
    material = _material("make this shorter", {"assets": [], "components": []}, document)
    assert material == (
        "This comment is about a passage of the document Report.qmd (ID: d1), which read_file "
        'reads in full:\n"""\nYield fell above 3,800 m.\n"""\n\nmake this shorter'
    )


def test_the_prompt_lists_the_mini_mes_to_hand_off_to():
    mini_mes = [
        {"id": "m-profiler", "name": "Profiler", "description": "Describes a data table"},
        {"id": "m-plotter", "name": "Plotter", "description": "Draws charts of a data table"},
    ]
    material = _material("profile it", {"assets": [], "components": []}, mini_mes=mini_mes)
    assert material.endswith(
        "Mini-Mes you can hand off to:\n"
        "- Profiler: Describes a data table\n"
        "- Plotter: Draws charts of a data table"
    )
