"""A Workflow as data, and the rules that do not depend on running it: which Trait Steps
stream into the reply, what a Step's output is, and which earlier outputs a Step sees."""

from dataclasses import dataclass, field
from typing import Any

# Earlier Step outputs given to a Trait call are cut to this many characters, newest kept.
EARLIER_BUDGET_CHARS = 50_000


@dataclass(frozen=True)
class Branch:
    label: str
    steps: tuple["Step", ...]


@dataclass(frozen=True)
class Step:
    id: str
    type: str
    label: str | None = None
    trait: str | None = None
    prompt: str = ""
    question: str = ""
    max_iterations: int = 1
    steps: tuple["Step", ...] = ()
    branches: tuple[Branch, ...] = ()

    def name(self, trait_names: dict[str, str]) -> str:
        """How the Step is shown: its Trait's name, else its label, else its type."""
        if self.type == "trait" and self.trait in trait_names:
            return trait_names[self.trait]
        return self.label or self.type.capitalize()


def parse_steps(steps: list[dict[str, Any]]) -> tuple[Step, ...]:
    """The Steps of a Workflow as `run.start` sends them; the core has already checked them."""
    return tuple(_parse_step(s) for s in steps)


def _parse_step(raw: dict[str, Any]) -> Step:
    return Step(
        id=str(raw["id"]),
        type=str(raw.get("type", "trait")),
        label=raw.get("label"),
        trait=raw.get("trait"),
        prompt=str(raw.get("prompt", "")),
        question=str(raw.get("question", "")),
        max_iterations=int(raw.get("max_iterations", 1)),
        steps=parse_steps(raw.get("steps") or []),
        branches=tuple(
            Branch(label=str(b["label"]), steps=parse_steps(b.get("steps") or []))
            for b in raw.get("branches") or []
        ),
    )


def final_steps(steps: tuple[Step, ...]) -> set[str]:
    """The IDs of the Trait Steps whose text streams into the reply: those no other Step can
    follow. Such a Step is the last of its list, and that list is the Workflow's own or a
    branch of a condition that is itself final; Steps in loops and parallel branches can be
    followed by another run of their list or by the join, so they never are."""
    if not steps:
        return set()
    last = steps[-1]
    if last.type == "trait":
        return {last.id}
    if last.type == "condition":
        return set().union(*(final_steps(b.steps) for b in last.branches))
    return set()


@dataclass(frozen=True)
class Entry:
    """One Step's completion in a run. `parent` is the ID of the list the Step belongs to
    (a control Step, or `""` for the Workflow's own list), plus `/<label>` for a branch.
    `scope` maps each parallel Step the Step ran inside to its branch label. `streamed` is
    set when the output already reached the reply as it was written."""

    step_id: str
    name: str
    output: str | None
    parent: str
    scope: dict[str, str] = field(default_factory=dict)
    trait: bool = False
    streamed: bool = False
    # A marker opens a new pass of a control Step's list, such as a loop iteration.
    marker: bool = False

    def to_json(self) -> dict[str, Any]:
        return {
            "step_id": self.step_id,
            "name": self.name,
            "output": self.output,
            "parent": self.parent,
            "scope": self.scope,
            "trait": self.trait,
            "streamed": self.streamed,
            "marker": self.marker,
        }

    @staticmethod
    def from_json(raw: dict[str, Any]) -> "Entry":
        return Entry(**raw)


def list_output(log: list[Entry], parent: str, since_marker_of: str) -> Entry | None:
    """The latest entry with an output in the list `parent`, written after the latest marker
    of `since_marker_of` (all of `log` when there is none)."""
    for entry in reversed(log):
        if entry.marker and entry.step_id == since_marker_of:
            return None
        if entry.parent == parent and not entry.marker and entry.output is not None:
            return entry
    return None


def parallel_output(branches: list[tuple[str, str | None]]) -> str | None:
    """A parallel Step's output: each branch's output under a `## <label>` line, in branch
    order, leaving out branches without one."""
    parts = [f"## {label}\n\n{output}" for label, output in branches if output is not None]
    return "\n\n".join(parts) if parts else None


def visible_outputs(log: list[Entry], scope: dict[str, str]) -> list[dict[str, Any]]:
    """The earlier Trait Step outputs a Trait Step with `scope` sees, as `{ step_id, name,
    output }` in the order they finished: all but those of other branches of a parallel Step
    it is inside, cut to the budget with the newest kept."""
    seen = [
        e
        for e in log
        if e.trait
        and e.output is not None
        and not any(scope.get(pid, label) != label for pid, label in e.scope.items())
    ]
    kept: list[dict[str, Any]] = []
    total = 0
    for entry in reversed(seen):
        assert entry.output is not None
        total += len(entry.output)
        if total > EARLIER_BUDGET_CHARS:
            break
        kept.append({"step_id": entry.step_id, "name": entry.name, "output": entry.output})
    kept.reverse()
    return kept
