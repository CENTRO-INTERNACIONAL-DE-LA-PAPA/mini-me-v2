import asyncio
import uuid
from typing import Any

import pytest
from langgraph.types import Command

from mini_me_sidecar.context import TraitError
from mini_me_sidecar.workflow import state as saved_state
from mini_me_sidecar.workflow.graph import compile_workflow, workflow_output
from mini_me_sidecar.workflow.model import Step, parse_steps


class FakeEnv:
    """Runs Trait Steps by writing their ID, and answers decisions from a script."""

    def __init__(self, answers: list[str] | None = None) -> None:
        self.answers = list(answers or [])
        self.events: list[tuple[str, str]] = []
        self.seen: dict[str, list[str]] = {}
        self.outputs: dict[str, dict[str, str]] = {}
        self.asked = 0
        self.resuming: str | None = None

    async def trait(self, step: Step, earlier: list[dict[str, Any]], stream: bool) -> str:
        self.events.append(("trait", step.id))
        self.seen[step.id] = [e["step_id"] for e in earlier]
        self.outputs[step.id] = {e["step_id"]: e["output"] for e in earlier}
        await asyncio.sleep(0)
        return f"{step.id} output"

    async def decide(self, step: Step, choices: list[str], earlier: list[dict[str, Any]]) -> str:
        self.events.append(("decide", step.id))
        return self.answers.pop(0)

    async def questions(self, step: Step, earlier: list[dict[str, Any]]) -> str:
        self.asked += 1
        return f"questions after {[e['step_id'] for e in earlier]}"

    def started(self, step: Step) -> None:
        self.events.append(("started", step.id))

    def completed(self, step: Step, output: str | None) -> None:
        self.events.append(("completed", step.id))

    def first_visit(self, step: Step) -> bool:
        return step.id != self.resuming


def run(steps: list[dict[str, Any]], env: FakeEnv) -> tuple[dict[str, Any], Any, str]:
    async def go() -> tuple[dict[str, Any], Any, str]:
        saver = saved_state.new_saver()
        thread = str(uuid.uuid4())
        graph = compile_workflow(parse_steps(steps), env, {}, saver)
        config = {"configurable": {"thread_id": thread}}
        result = await graph.ainvoke({}, config, durability="sync")
        return result, saver, thread

    return asyncio.run(go())


def output(result: dict[str, Any]) -> str | None:
    entry = workflow_output(result)
    return entry.output if entry else None


def traits(env: FakeEnv) -> list[str]:
    return [step for kind, step in env.events if kind == "trait"]


def test_an_empty_branch_skips_to_the_next_step_and_leaves_the_earlier_output():
    env = FakeEnv(["skip", "skip"])
    steps = [{"id": "a", "trait": "t"},
             {"id": "middle", "type": "condition", "question": "?", "branches": [
                 {"label": "run", "steps": [{"id": "m", "trait": "t"}]},
                 {"label": "skip", "steps": []}]},
             {"id": "b", "trait": "t"},
             {"id": "last", "type": "condition", "question": "?", "branches": [
                 {"label": "run", "steps": [{"id": "l", "trait": "t"}]},
                 {"label": "skip", "steps": []}]}]
    result, _, _ = run(steps, env)
    assert traits(env) == ["a", "b"]
    assert env.seen["b"] == ["a"]
    assert output(result) == "b output"

    env = FakeEnv()
    steps = [{"id": "split", "type": "parallel", "branches": [
        {"label": "A", "steps": [{"id": "a", "trait": "t"}]},
        {"label": "B", "steps": []}]}]
    result, _, _ = run(steps, env)
    assert traits(env) == ["a"]
    assert output(result) == "## A\n\na output"


def test_a_loop_stops_at_its_limit_without_asking_again():
    env = FakeEnv(["repeat"])
    steps = [{"id": "again", "type": "loop", "question": "?", "max_iterations": 2,
              "steps": [{"id": "refute", "trait": "t"}]},
             {"id": "after", "trait": "t"}]
    result, _, _ = run(steps, env)
    assert traits(env) == ["refute", "refute", "after"]
    assert env.seen["after"] == ["refute", "refute"]
    assert ("decide", "again") in env.events and env.answers == []
    assert output(result) == "after output"


def resumed(
    steps: list[dict[str, Any]], saver: Any, thread: str, answer: dict[str, Any]
) -> tuple[dict[str, Any], FakeEnv]:
    async def go() -> tuple[dict[str, Any], FakeEnv]:
        state = await saved_state.save(saver, thread)
        later = FakeEnv()
        later.resuming = "ask"
        restored = await saved_state.restore(state, thread)
        graph = compile_workflow(parse_steps(steps), later, {}, restored)
        config = {"configurable": {"thread_id": thread}}
        done = await graph.ainvoke(Command(resume=answer), config, durability="sync")
        return done, later

    return asyncio.run(go())


def test_a_run_paused_at_an_approval_resumes_from_its_saved_state():
    steps = [{"id": "plan", "trait": "t"},
             {"id": "pick", "type": "condition", "question": "?", "branches": [
                 {"label": "go", "steps": [{"id": "ask", "type": "approval", "prompt": "?"},
                                           {"id": "experiment", "trait": "t"}]},
                 {"label": "stop", "steps": [{"id": "other", "trait": "t"}]}]}]
    env = FakeEnv(["go"])
    result, saver, thread = run(steps, env)
    assert result["__interrupt__"][0].value == {"step_id": "ask", "prompt": None}
    assert output(result) == "plan output"
    assert ("started", "ask") in env.events

    done, later = resumed(steps, saver, thread, {"text": None})
    assert later.events == [("trait", "experiment")]
    assert later.seen["experiment"] == ["plan"]
    assert output(done) == "experiment output"

    steps = [{"id": "plan", "trait": "t"},
             {"id": "ask", "type": "approval", "prompt": "Ask what is unclear",
              "questions_by": "model"},
             {"id": "after", "trait": "t"}]
    env = FakeEnv()
    result, saver, thread = run(steps, env)
    assert result["__interrupt__"][0].value["prompt"] == "questions after ['plan']"
    assert env.asked == 1

    _, later = resumed(steps, saver, thread, {"text": "yield, by rainfall"})
    assert later.asked == 0
    assert later.outputs["after"] == {"plan": "plan output", "ask": "yield, by rainfall"}

    _, skipped = resumed(steps, saver, thread, {"text": None})
    assert skipped.seen["after"] == ["plan"]


def test_a_state_that_cannot_be_read_fails_to_resume():
    with pytest.raises(TraitError) as raised:
        asyncio.run(saved_state.restore('{"format": 99}', "t"))
    assert raised.value.code == "resume_failed"
