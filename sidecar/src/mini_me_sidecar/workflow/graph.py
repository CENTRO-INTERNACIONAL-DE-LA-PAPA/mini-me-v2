"""Compiles a Workflow into a LangGraph graph. Each list of Steps becomes a chain of nodes;
conditions and loops branch with conditional edges, and parallel Steps fan out to their
branches and join on a barrier. Running Steps is left to an `Env`, so the graph only
decides the order."""

import operator
from typing import Annotated, Any, Awaitable, Callable, Protocol, TypedDict

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

from mini_me_sidecar.workflow.model import (
    Entry,
    Step,
    final_steps,
    list_output,
    parallel_output,
    visible_outputs,
)

REPEAT = "repeat"
STOP = "stop"


def _merge(old: dict[str, Any], new: dict[str, Any]) -> dict[str, Any]:
    return {**old, **new}


class RunState(TypedDict, total=False):
    # `Entry.to_json()` of every completion and marker, in the order they happened.
    log: Annotated[list[dict[str, Any]], operator.add]
    # Completed iterations of each loop.
    loops: Annotated[dict[str, int], _merge]
    # The latest choice of each condition and loop.
    decisions: Annotated[dict[str, str], _merge]


class Env(Protocol):
    """What running a Workflow's Steps needs from outside the graph."""

    async def trait(self, step: Step, earlier: list[dict[str, Any]], stream: bool) -> str:
        """Runs a Trait Step's call, reporting its Step events, and returns its output."""
        ...

    async def decide(self, step: Step, choices: list[str], earlier: list[dict[str, Any]]) -> str:
        """Asks the model for a condition's or loop's decision, reporting its Step events."""
        ...

    def started(self, step: Step) -> None:
        """Reports that a Step without a call started."""
        ...

    def completed(self, step: Step, output: str | None) -> None:
        """Reports that a Step without a call completed."""
        ...

    def first_visit(self, step: Step) -> bool:
        """False only when an approval Step runs again because its run resumes there."""
        ...


Node = Callable[[RunState], Awaitable[dict[str, Any]]]


def _log(state: RunState) -> list[Entry]:
    return [Entry.from_json(e) for e in state.get("log") or []]


class _Builder:
    def __init__(self, env: Env, trait_names: dict[str, str], steps: tuple[Step, ...]) -> None:
        self.env = env
        self.names = trait_names
        self.finals = final_steps(steps)
        self.graph = StateGraph(RunState)

    def node(self, name: str, fn: Node) -> str:
        self.graph.add_node(name, fn)
        return name

    def chain(
        self, steps: tuple[Step, ...], parent: str, scope: dict[str, str]
    ) -> tuple[str, Callable[[str], None]]:
        """Adds `steps` as a chain; returns its first node and a function that links its
        end to a target node."""
        first: str | None = None
        link: Callable[[str], None] | None = None
        for step in steps:
            entry, step_link = self.step(step, parent, scope)
            if link is None:
                first = entry
            else:
                link(entry)
            link = step_link
        assert first is not None and link is not None, "the core refuses empty lists"
        return first, link

    def edge_from(self, source: str) -> Callable[[str], None]:
        return lambda target: self.graph.add_edge(source, target)

    def step(
        self, step: Step, parent: str, scope: dict[str, str]
    ) -> tuple[str, Callable[[str], None]]:
        name = step.name(self.names)
        env = self.env

        def entry(output: str | None, **extra: Any) -> dict[str, Any]:
            return Entry(step.id, name, output, parent, dict(scope), **extra).to_json()

        def marker() -> dict[str, Any]:
            return Entry(step.id, name, None, parent, dict(scope), marker=True).to_json()

        match step.type:
            case "trait":
                stream = step.id in self.finals

                async def run_trait(state: RunState) -> dict[str, Any]:
                    earlier = visible_outputs(_log(state), scope)
                    output = await env.trait(step, earlier, stream)
                    return {"log": [entry(output, trait=True, streamed=stream)]}

                node = self.node(f"trait.{step.id}", run_trait)
                return node, self.edge_from(node)

            case "approval":

                async def approve(state: RunState) -> dict[str, Any]:
                    if env.first_visit(step):
                        env.started(step)
                    interrupt({"step_id": step.id})
                    return {}

                node = self.node(f"approval.{step.id}", approve)
                return node, self.edge_from(node)

            case "condition":
                labels = [b.label for b in step.branches]

                async def choose(state: RunState) -> dict[str, Any]:
                    earlier = visible_outputs(_log(state), scope)
                    choice = await env.decide(step, labels, earlier)
                    return {"decisions": {step.id: choice}, "log": [marker()]}

                async def close(state: RunState) -> dict[str, Any]:
                    choice = (state.get("decisions") or {})[step.id]
                    out = list_output(_log(state), f"{step.id}/{choice}", step.id)
                    if out is None:
                        return {"log": [entry(None)]}
                    return {"log": [entry(out.output, streamed=out.streamed)]}

                decision = self.node(f"condition.{step.id}", choose)
                end = self.node(f"condition-end.{step.id}", close)
                targets: dict[str, str] = {}
                for branch in step.branches:
                    first, link = self.chain(branch.steps, f"{step.id}/{branch.label}", scope)
                    targets[branch.label] = first
                    link(end)
                self.graph.add_conditional_edges(
                    decision, lambda s, i=step.id: (s.get("decisions") or {})[i], targets
                )
                return decision, self.edge_from(end)

            case "loop":

                async def begin(state: RunState) -> dict[str, Any]:
                    return {"loops": {step.id: 0}, "log": [marker()]}

                async def again(state: RunState) -> dict[str, Any]:
                    log = _log(state)
                    count = (state.get("loops") or {}).get(step.id, 0) + 1
                    if count >= step.max_iterations:
                        env.started(step)
                        env.completed(step, STOP)
                        choice = STOP
                    else:
                        earlier = visible_outputs(log, scope)
                        choice = await env.decide(step, [REPEAT, STOP], earlier)
                    update: dict[str, Any] = {
                        "loops": {step.id: count},
                        "decisions": {step.id: choice},
                    }
                    if choice == REPEAT:
                        update["log"] = [marker()]
                    else:
                        out = list_output(log, step.id, step.id)
                        update["log"] = [entry(out.output if out else None)]
                    return update

                start = self.node(f"loop.{step.id}", begin)
                decision = self.node(f"loop-decision.{step.id}", again)
                first, link = self.chain(step.steps, step.id, scope)
                self.graph.add_edge(start, first)
                link(decision)

                def link_out(target: str) -> None:
                    self.graph.add_conditional_edges(
                        decision,
                        lambda s, i=step.id: (s.get("decisions") or {})[i],
                        {REPEAT: first, STOP: target},
                    )

                return start, link_out

            case "parallel":

                async def split(state: RunState) -> dict[str, Any]:
                    env.started(step)
                    return {"log": [marker()]}

                async def join(state: RunState) -> dict[str, Any]:
                    log = _log(state)
                    outputs = []
                    for branch in step.branches:
                        out = list_output(log, f"{step.id}/{branch.label}", step.id)
                        outputs.append((branch.label, out.output if out else None))
                    joined = parallel_output(outputs)
                    env.completed(step, joined)
                    return {"log": [entry(joined)]}

                async def pass_through(state: RunState) -> dict[str, Any]:
                    return {}

                start = self.node(f"parallel.{step.id}", split)
                end = self.node(f"parallel-join.{step.id}", join)
                ends: list[str] = []
                for branch in step.branches:
                    inner = {**scope, step.id: branch.label}
                    first, link = self.chain(branch.steps, f"{step.id}/{branch.label}", inner)
                    self.graph.add_edge(start, first)
                    # Every branch ends in its own node, so the join can wait for all of them
                    # even when a branch ends with a loop's conditional edge.
                    branch_end = self.node(f"branch-end.{step.id}/{branch.label}", pass_through)
                    link(branch_end)
                    ends.append(branch_end)
                self.graph.add_edge(ends, end)
                return start, self.edge_from(end)

        raise ValueError(f"unknown Step type {step.type!r}")


def compile_workflow(
    steps: tuple[Step, ...],
    env: Env,
    trait_names: dict[str, str],
    checkpointer: BaseCheckpointSaver,
) -> Any:
    """The compiled graph of the Workflow `steps`. Its state's `log` gives the Workflow's
    output with `workflow_output`."""
    builder = _Builder(env, trait_names, steps)
    first, link = builder.chain(steps, "", {})
    builder.graph.add_edge(START, first)
    link(END)
    return builder.graph.compile(checkpointer=checkpointer)


def workflow_output(state: RunState) -> Entry | None:
    """The entry holding the Workflow's output so far: the latest top-level Step output."""
    return list_output(_log(state), "", "")
