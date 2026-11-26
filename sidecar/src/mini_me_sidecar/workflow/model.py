"""A Workflow as data, and the rules that do not depend on running it: which Trait Steps
stream into the reply, which Traits can follow a Step, what a Step's output is, and which
earlier outputs a Step sees."""

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
    questions_by: str | None = None
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
        questions_by=raw.get("questions_by"),
        question=str(raw.get("question", "")),
        max_iterations=int(raw.get("max_iterations", 1)),
        steps=parse_steps(raw.get("steps") or []),
        branches=tuple(
            Branch(label=str(b["label"]), steps=parse_steps(b.get("steps") or []))
            for b in raw.get("branches") or []
        ),
    )


def final_steps(steps: tuple[Step, ...]) -> set[str]:
    """IDs of the Trait Steps no other Step can follow, whose text streams into the reply. Steps
    in loops and parallel branches never are, as a rerun or the join follows them."""
    if not steps:
        return set()
    last = steps[-1]
    if last.type == "trait":
        return {last.id}
    if last.type == "condition":
        return set().union(*(final_steps(b.steps) for b in last.branches))
    return set()


def later_traits(steps: tuple[Step, ...], step_id: str) -> list[str]:
    """IDs of the Traits that can still run after Step `step_id`, each once, in Workflow order:
    the rest of its sequences, and every Step of a loop it is in, but not other branches."""
    return list(dict.fromkeys(_later_traits(steps, step_id) or []))


def _later_traits(steps: tuple[Step, ...], step_id: str) -> list[str] | None:
    """None when `step_id` is not among `steps` or inside them."""
    for i, step in enumerate(steps):
        if step.id == step_id:
            inner: list[str] | None = []
        elif step.type == "loop":
            inner = _later_traits(step.steps, step_id)
            inner = None if inner is None else inner + _traits(step.steps)
        else:
            found = (_later_traits(b.steps, step_id) for b in step.branches)
            inner = next((f for f in found if f is not None), None)
        if inner is not None:
            return inner + _traits(steps[i + 1 :])
    return None


def _traits(steps: tuple[Step, ...]) -> list[str]:
    """Every Trait of `steps` and the Steps inside them, in order."""
    ids: list[str] = []
    for step in steps:
        if step.type == "trait" and step.trait:
            ids.append(step.trait)
        ids += _traits(step.steps)
        for branch in step.branches:
            ids += _traits(branch.steps)
    return ids


@dataclass(frozen=True)
class Entry:
    """One Step's completion. `parent` is its list's control Step ID (`""` at top level), plus
    `/<label>` in a branch; `scope` maps each enclosing parallel Step to its branch label;
    `streamed` means the output already reached the reply."""

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
    """Each branch's output under a `## <label>` line, in order, skipping branches without one."""
    parts = [f"## {label}\n\n{output}" for label, output in branches if output is not None]
    return "\n\n".join(parts) if parts else None


def labelled_outputs(steps: list[dict[str, Any]]) -> list[str]:
    return [f"--- {s.get('name', '')} ---\n{s.get('output', '')}" for s in steps]


def earlier_outputs_text(steps: list[dict[str, Any]]) -> str:
    intro = "Outputs of the earlier Steps of your Workflow for this message:"
    return "\n\n".join([intro, *labelled_outputs(steps)])


def visible_outputs(log: list[Entry], scope: dict[str, str]) -> list[dict[str, Any]]:
    """Earlier outputs of Trait Steps and written answers that a Step in `scope` sees, `{ step_id,
    name, output }` in finishing order: none from other branches of its parallel Steps, cut to
    the budget, newest kept."""
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
