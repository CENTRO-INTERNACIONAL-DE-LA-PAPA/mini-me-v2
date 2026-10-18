import asyncio
import uuid
from typing import Any

from langgraph.types import Command

from mini_me_sidecar.workflow import state as saved_state
from mini_me_sidecar.workflow.graph import compile_workflow, workflow_output
from mini_me_sidecar.workflow.model import Step, parse_steps


class FakeEnv:
    """Runs Trait Steps by writing their ID, and answers decisions from a script."""

    def __init__(self, answers: list[str] | None = None) -> None:
        self.answers = list(answers or [])
        self.events: list[tuple[str, str]] = []
        self.seen: dict[str, list[str]] = {}
        self.streamed: list[str] = []
        self.resuming: str | None = None

    async def trait(self, step: Step, earlier: list[dict[str, Any]], stream: bool) -> str:
        self.events.append(("trait", step.id))
        self.seen[step.id] = [e["step_id"] for e in earlier]
        if stream:
            self.streamed.append(step.id)
        await asyncio.sleep(0)
        return f"{step.id} output"

    async def decide(self, step: Step, choices: list[str], earlier: list[dict[str, Any]]) -> str:
        self.events.append(("decide", step.id))
        return self.answers.pop(0)

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


def test_a_sequence_runs_in_order_and_later_steps_see_earlier_outputs():
    env = FakeEnv()
    result, _, _ = run([{"id": "a", "trait": "t"}, {"id": "b", "trait": "t"}], env)
    assert traits(env) == ["a", "b"]
    assert env.seen["b"] == ["a"]
    assert env.streamed == ["b"]
    assert output(result) == "b output"


def test_a_condition_runs_only_the_chosen_branch():
    env = FakeEnv(["no"])
    steps = [{"id": "pick", "type": "condition", "question": "?", "branches": [
        {"label": "yes", "steps": [{"id": "y", "trait": "t"}]},
        {"label": "no", "steps": [{"id": "n", "trait": "t"}]}]}]
    result, _, _ = run(steps, env)
    assert traits(env) == ["n"]
    assert env.streamed == ["n"]
    assert output(result) == "n output"


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


def test_a_parallel_step_runs_both_branches_then_joins_them():
    env = FakeEnv()
    steps = [{"id": "split", "type": "parallel", "branches": [
        {"label": "A", "steps": [{"id": "a", "trait": "t"}, {"id": "a2", "trait": "t"}]},
        {"label": "B", "steps": [{"id": "b", "trait": "t"}]}]}]
    result, _, _ = run(steps, env)
    assert sorted(traits(env)) == ["a", "a2", "b"]
    assert env.seen["a2"] == ["a"] and env.seen["b"] == []
    assert env.streamed == []
    assert output(result) == "## A\n\na2 output\n\n## B\n\nb output"
    assert ("completed", "split") in env.events


def test_a_run_paused_at_an_approval_resumes_from_its_saved_state():
    steps = [{"id": "plan", "trait": "t"},
             {"id": "pick", "type": "condition", "question": "?", "branches": [
                 {"label": "go", "steps": [{"id": "ask", "type": "approval", "prompt": "?"},
                                           {"id": "experiment", "trait": "t"}]},
                 {"label": "stop", "steps": [{"id": "other", "trait": "t"}]}]}]
    env = FakeEnv(["go"])
    result, saver, thread = run(steps, env)
    assert result["__interrupt__"][0].value == {"step_id": "ask"}
    assert output(result) == "plan output"
    assert ("started", "ask") in env.events

    async def resume() -> tuple[dict[str, Any], FakeEnv]:
        state = await saved_state.save(saver, thread)
        later = FakeEnv()
        later.resuming = "ask"
        restored = await saved_state.restore(state, thread)
        graph = compile_workflow(parse_steps(steps), later, {}, restored)
        config = {"configurable": {"thread_id": thread}}
        done = await graph.ainvoke(Command(resume=True), config, durability="sync")
        return done, later

    done, later = asyncio.run(resume())
    assert later.events == [("trait", "experiment")]
    assert later.seen["experiment"] == ["plan"]
    assert output(done) == "experiment output"


def test_a_state_that_cannot_be_read_fails_to_resume():
    try:
        asyncio.run(saved_state.restore('{"format": 99}', "t"))
    except Exception as error:
        assert getattr(error, "code", None) == "resume_failed"
    else:
        raise AssertionError("restore accepted a state of another format")
