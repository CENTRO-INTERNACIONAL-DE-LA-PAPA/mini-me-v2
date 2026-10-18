"""Runs Mini-Me runs concurrently: each `run.start` compiles its Workflow and runs it as one
task, inside an error boundary, until it ends with `run.done`, `run.paused`, `run.error` or
`run.cancelled`."""

import asyncio
import sys
import traceback
import uuid
from typing import Any

from langgraph.types import Command

from mini_me_sidecar.adapters.base import Adapter
from mini_me_sidecar.context import CallContext, Requests, TraitError
from mini_me_sidecar.link import Link, log
from mini_me_sidecar.workflow import state as saved_state
from mini_me_sidecar.workflow.decide import decide
from mini_me_sidecar.workflow.graph import compile_workflow, workflow_output
from mini_me_sidecar.workflow.model import Step, parse_steps

# After `run.cancel`, a run's Trait calls get this long to return on their own before its
# task is cancelled. The core stops waiting for the run after five seconds.
CANCEL_GRACE_S = 2.0

# Each run has a graph of its own, so one checkpoint thread per graph is enough.
THREAD = "run"


class Run:
    """One Mini-Me run, and how its Steps reach adapters, the model and the core."""

    def __init__(
        self, link: Link, requests: Requests, adapters: dict[str, Adapter], frame: dict[str, Any]
    ) -> None:
        self.run_id = str(frame["run_id"])
        self.steps = parse_steps((frame.get("workflow") or {}).get("steps") or [])
        self.traits = {str(t["id"]): t for t in frame.get("traits") or []}
        self.model = frame.get("model")
        self.input: dict[str, Any] = frame.get("input") or {}
        self.context: dict[str, Any] = frame.get("context") or {}
        self.mini_me_name = (frame.get("mini_me") or {}).get("name")
        self.resume: dict[str, Any] | None = frame.get("resume")
        self.cancelled = False
        self.ended = False
        self._link = link
        self._requests = requests
        self._adapters = adapters
        # The approval Step this run resumes after, until its node has run again.
        self._resuming = (self.resume or {}).get("step_id")
        self._calls: set[CallContext] = set()

    def missing_adapter(self) -> str | None:
        for definition in self.traits.values():
            if definition.get("adapter") not in self._adapters:
                return str(definition.get("adapter"))
        return None

    def trait_names(self) -> dict[str, str]:
        return {tid: str(t.get("name", "")) for tid, t in self.traits.items()}

    def send(self, frame: dict[str, Any]) -> None:
        if not self.ended:
            self._link.send({**frame, "run_id": self.run_id})

    def _call(self, call_id: str, start: dict[str, Any], stream: bool) -> CallContext:
        context = {**self.context, "mini_me_name": self.mini_me_name, **start.pop("context")}
        ctx = CallContext(
            self._link, self._requests, call_id, {**start, "context": context}, self.run_id, stream
        )
        if self.cancelled:
            ctx.cancelled.set()
        self._calls.add(ctx)
        return ctx

    def _close(self, ctx: CallContext) -> None:
        ctx.flush_progress()
        ctx.ended = True
        self._calls.discard(ctx)
        if self.cancelled:
            raise asyncio.CancelledError

    async def trait(self, step: Step, earlier: list[dict[str, Any]], stream: bool) -> str:
        definition = self.traits[str(step.trait)]
        adapter = self._adapters[str(definition["adapter"])]
        call_id = str(uuid.uuid4())
        self.send({"type": "step.started", "step_id": step.id, "call_id": call_id})
        start = {
            "trait": definition,
            "model": self.model if adapter.info.providers else None,
            "context": {"steps": earlier},
        }
        ctx = self._call(call_id, start, stream)
        try:
            await adapter.run(ctx, dict(self.input))
        finally:
            self._close(ctx)
        self.send({"type": "step.completed", "step_id": step.id, "output": ctx.output})
        return ctx.output

    async def decide(self, step: Step, choices: list[str], earlier: list[dict[str, Any]]) -> str:
        call_id = str(uuid.uuid4())
        self.send({"type": "step.started", "step_id": step.id, "call_id": call_id})
        name = step.name(self.trait_names())
        start = {"trait": {"name": name}, "model": self.model, "context": {"steps": earlier}}
        ctx = self._call(call_id, start, stream=False)
        try:
            message = str(self.input.get("text", ""))
            choice = await decide(ctx, step.question, choices, message, earlier)
        finally:
            self._close(ctx)
        self.send({"type": "step.completed", "step_id": step.id, "output": choice})
        return choice

    def started(self, step: Step) -> None:
        self.send({"type": "step.started", "step_id": step.id, "call_id": None})

    def completed(self, step: Step, output: str | None) -> None:
        self.send({"type": "step.completed", "step_id": step.id, "output": output})

    def first_visit(self, step: Step) -> bool:
        if step.id == self._resuming:
            self._resuming = None
            return False
        return True

    def cancel(self) -> None:
        self.cancelled = True
        for ctx in self._calls:
            ctx.cancelled.set()

    async def execute(self) -> None:
        """Runs the Workflow from its start or from `resume`; returns normally once it
        has ended or paused, and raises like a Trait otherwise."""
        if self.resume is not None:
            saver = await saved_state.restore(str(self.resume.get("state", "")), THREAD)
            start: Any = Command(resume=True)
        else:
            saver = saved_state.new_saver()
            start = {}
        graph = compile_workflow(self.steps, self, self.trait_names(), saver)
        config = {"configurable": {"thread_id": THREAD}}
        result = await graph.ainvoke(start, config, durability="sync")
        out = workflow_output(result)
        if interrupts := result.get("__interrupt__"):
            state = await saved_state.save(saver, THREAD)
            self.send(
                {
                    "type": "run.paused",
                    "step_id": interrupts[0].value["step_id"],
                    "output": out.output if out else None,
                    "state": state,
                }
            )
            self.ended = True
            return
        if out is not None and out.output and not out.streamed:
            self.send({"type": "run.delta", "text": out.output})


class Runs:
    def __init__(self, link: Link, adapters: dict[str, Adapter], requests: Requests) -> None:
        self._link = link
        self._adapters = adapters
        self._requests = requests
        self._runs: dict[str, tuple[asyncio.Task[None], Run]] = {}

    def start(self, frame: dict[str, Any]) -> None:
        run_id = frame.get("run_id")
        if not isinstance(run_id, str) or run_id in self._runs:
            log(f"ignoring run.start with missing or duplicate run_id {run_id!r}")
            return
        run = Run(self._link, self._requests, self._adapters, frame)
        if (missing := run.missing_adapter()) is not None:
            self._end(run, "error", code="unknown_adapter",
                      message=f"There is no adapter called {missing!r}.")
            return
        task = asyncio.create_task(self._run(run))
        self._runs[run_id] = (task, run)

    async def _run(self, run: Run) -> None:
        try:
            await run.execute()
        except asyncio.CancelledError:
            outcome: dict[str, str] = {"kind": "cancelled"}
        except TraitError as error:
            outcome = {"kind": "error", "code": error.code, "message": str(error)}
        except Exception as error:
            traceback.print_exc(file=sys.stderr)
            outcome = {"kind": "error", "code": "trait_error",
                       "message": str(error) or type(error).__name__}
        else:
            outcome = {"kind": "cancelled" if run.cancelled else "done"}
        # Stops Trait calls of other parallel branches that are still running.
        run.cancel()
        self._runs.pop(run.run_id, None)
        if run.ended:
            return
        kind = outcome.pop("kind")
        self._end(run, kind, **outcome)

    def _end(self, run: Run, kind: str, **error: str) -> None:
        if kind == "error":
            run.send({"type": "run.error", "error": error})
        else:
            run.send({"type": f"run.{kind}"})
        run.ended = True

    def cancel(self, run_id: str | None) -> None:
        entry = self._runs.get(run_id or "")
        if entry is None:
            return
        task, run = entry
        run.cancel()
        asyncio.get_running_loop().call_later(CANCEL_GRACE_S, task.cancel)

    def resolve(self, frame: dict[str, Any]) -> None:
        self._requests.resolve(frame)

    async def close(self) -> None:
        for task, _ in list(self._runs.values()):
            task.cancel()
