"""Adapters for Ai2's Asta services: Paper Finder (*Find Papers*) and the Theorizer
(*Theorize*). Both use the Ai2 account's access token, which the core refreshes; Asta's own
token storage and CLI are never used."""

import asyncio
import json
import sys
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

from mini_me_sidecar.adapters.base import Adapter, AdapterInfo
from mini_me_sidecar.context import CallContext, CoreRequestError, TraitError

AI2 = "ai2"

TEXT_INPUT: dict[str, Any] = {
    "type": "object",
    "properties": {"text": {"type": "string"}},
    "required": ["text"],
}

MAX_PAPERS = 20
PAPER_FINDER_TIMEOUT_S = 300

# The Theorizer's end-to-end skill: it finds papers, extracts evidence and forms theories.
# With its default of 10 papers a run takes about 3–8 minutes.
THEORIZER_SKILL = "literature-theory-generation"

# Poll the Theorizer's task this often, and give up after this long.
THEORIZER_POLL_S = 5.0
THEORIZER_LIMIT_S = 60 * 60

T = TypeVar("T")

# What the progress line says for a Theorizer task state that comes without status text.
STATE_LABELS = {"submitted": "Queued at Ai2", "working": "Working"}


class FindPapers(Adapter):
    info = AdapterInfo(
        id="asta-paper-finder",
        description="Finds papers on a topic with Ai2's Paper Finder.",
        input_schema=TEXT_INPUT,
        providers=(AI2,),
    )

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        # Asta's packages load only when a call runs, so the sidecar starts quickly and
        # sessions that never use Asta never load them.
        from asta.literature.client import AstaPaperFinder
        from asta.utils.config import get_api_config

        token = await _token(ctx)
        query = str(input.get("text", "")).strip()
        finder = AstaPaperFinder(
            base_url=get_api_config("paper_finder")["base_url"], access_token=token
        )
        ctx.progress("Searching papers…")
        result = await _until_cancelled(
            ctx,
            lambda: _call(
                finder.find_papers,
                query,
                timeout=PAPER_FINDER_TIMEOUT_S,
                operation_mode="infer",
            ),
        )
        if result is None:
            return
        widget = result.get("widget") or {}
        _log_shape("paper finder result", (widget.get("results") or [None])[:1])
        ctx.write(papers_reply(widget.get("results") or [], widget.get("response_text") or ""))


class Theorize(Adapter):
    info = AdapterInfo(
        id="asta-theorizer",
        description="Builds theories from the literature with Ai2's Theorizer.",
        input_schema=TEXT_INPUT,
        providers=(AI2,),
    )

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        # Imported here for the same reason as in `FindPapers.run`.
        from asta_agent.a2a.client import A2AClient
        from asta.utils.config import get_api_config

        token = await _token(ctx)
        client = A2AClient(get_api_config("theorizer")["base_url"], api_key=token)
        ctx.progress("Starting the Theorizer (this usually takes 3–8 minutes)…")

        # Naming the skill keeps the request from being routed to a narrower skill that takes
        # the same input.
        envelope = {
            "kind": THEORIZER_SKILL,
            "data": {"theory_query": str(input.get("text", ""))},
        }
        task = await _call(client.send_message, json.dumps(envelope))
        _log_task(task)

        loop = asyncio.get_running_loop()
        started = loop.time()
        deadline = started + THEORIZER_LIMIT_S
        seen: set[str] = set()
        while not _finished(task):
            if loop.time() > deadline:
                raise TraitError(
                    "asta_unavailable", "The Theorizer took too long. Try again later."
                )
            try:
                await asyncio.wait_for(ctx.cancelled.wait(), THEORIZER_POLL_S)
                return
            except TimeoutError:
                pass
            previous = task
            task = await _call(client.get_task, task.get("id") or "")
            if _task_summary(task) != _task_summary(previous):
                _log_task(task)
            minutes = int((loop.time() - started) // 60)
            state = (task.get("status") or {}).get("state")
            label = _status_text(task) or STATE_LABELS.get(str(state), "Working")
            for artifact in task.get("artifacts") or []:
                name = str(artifact.get("name") or "")
                if name and name not in seen:
                    seen.add(name)
                    label = f"Got {name.replace('_', ' ')}"
            ctx.progress(f"{label[:140]} · {minutes} min" if minutes else label[:140])

        state = (task.get("status") or {}).get("state")
        if state != "completed":
            detail = _status_text(task)
            raise TraitError(
                "asta_unavailable",
                f"The Theorizer stopped ({state}){': ' + detail if detail else ''}.",
            )
        _log_shape("theorizer artifacts", task.get("artifacts"))
        ctx.write(theories_reply(task.get("artifacts") or []))


async def _token(ctx: CallContext) -> str:
    try:
        return (await ctx.secret(AI2)).reveal()
    except CoreRequestError as error:
        if error.code == "secret_unavailable":
            raise TraitError(
                "secret_unavailable",
                "Sign in to your Ai2 account in Settings to use Researcher and Theorist.",
            ) from None
        raise


async def _call(function: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """Runs one of Asta's blocking client calls off the event loop, turning its errors into
    ones the user can act on."""
    try:
        return await asyncio.to_thread(function, *args, **kwargs)
    except TraitError:
        raise
    except Exception as error:
        raise _asta_error(error) from None


async def _until_cancelled(ctx: CallContext, work: Callable[[], Awaitable[T]]) -> T | None:
    """`work`'s result, or None as soon as the call is cancelled. A blocking request already
    sent finishes in its thread and its result is dropped."""
    job = asyncio.ensure_future(work())
    stop = asyncio.ensure_future(ctx.cancelled.wait())
    done, _ = await asyncio.wait({job, stop}, return_when=asyncio.FIRST_COMPLETED)
    if job in done:
        stop.cancel()
        return job.result()
    job.add_done_callback(lambda finished: finished.exception())
    return None


def _asta_error(error: Exception) -> TraitError:
    # Asta's clients raise urllib's HTTPError directly, wrap it, or carry its code.
    status = getattr(error, "code", None) or getattr(error.__cause__, "code", None)
    if status in (401, 403):
        return TraitError(
            "ai2_auth",
            "Ai2 did not accept your sign-in. Sign in to your Ai2 account again in Settings.",
        )
    return TraitError(
        "asta_unavailable",
        "Ai2's Asta service could not be reached or failed. Try again later.",
    )


def _finished(task: dict[str, Any]) -> bool:
    state = (task.get("status") or {}).get("state")
    return state in {"completed", "failed", "canceled", "rejected", "input-required"}


def _status_text(task: dict[str, Any]) -> str:
    parts = ((task.get("status") or {}).get("message") or {}).get("parts") or []
    texts = []
    for part in parts:
        if not isinstance(part, dict):
            continue
        if isinstance(part.get("text"), str):
            texts.append(part["text"])
        elif isinstance(part.get("data"), dict) and "message" in part["data"]:
            texts.append(str(part["data"]["message"]))
    return " ".join(t for t in texts if t).strip()


def _get(data: dict[str, Any], *keys: str) -> Any:
    """The first of `keys` present in `data`: Asta answers in snake_case or camelCase."""
    for key in keys:
        if data.get(key) is not None:
            return data[key]
    return None


def papers_reply(papers: list[dict[str, Any]], narrative: str) -> str:
    """Markdown for Paper Finder's results, most relevant first."""
    if not papers:
        return "No papers were found. Try rephrasing the topic or making it more specific."
    lines = [narrative.strip(), ""] if narrative.strip() else []
    for number, paper in enumerate(papers[:MAX_PAPERS], start=1):
        title = str(_get(paper, "title") or "Untitled")
        authors = [
            str(a.get("name") if isinstance(a, dict) else a) for a in (paper.get("authors") or [])
        ]
        names = ", ".join(authors[:3]) + (" et al." if len(authors) > 3 else "")
        year = _get(paper, "year")
        venue = _get(paper, "venue")
        corpus_id = _get(paper, "corpus_id", "corpusId")
        link = _get(paper, "url") or (
            f"https://www.semanticscholar.org/p/{corpus_id}" if corpus_id else None
        )
        heading = f"{number}. **{title}**" + (f" ({year})" if year else "")
        details = " · ".join(str(d) for d in (names, venue, link) if d)
        lines.append(heading + (f" — {details}" if details else ""))
        if reason := _relevance(paper):
            lines.append(f"   {reason}")
    if len(papers) > MAX_PAPERS:
        lines.append("")
        lines.append(f"…and {len(papers) - MAX_PAPERS} more.")
    return "\n".join(lines)


def _relevance(paper: dict[str, Any]) -> str:
    """Why the paper matches: Paper Finder's most relevant passage with its section, or a
    written judgement or the abstract's first sentence when there is no passage."""
    snippets = _get(paper, "relevant_snippets", "snippets") or []
    first = snippets[0] if snippets and isinstance(snippets[0], dict) else {}
    if text := str(first.get("text") or "").strip():
        section = first.get("section_title")
        return f"“{text}”" + (f" ({section})" if section else "")
    judgement = _get(paper, "relevance_judgement", "relevanceJudgement") or {}
    if summary := _get(judgement, "relevanceSummary", "relevance_summary"):
        return str(summary)
    abstract = str(_get(paper, "abstract") or "").strip()
    return abstract.split(". ")[0].rstrip(".") + "." if abstract else ""


def theories_reply(artifacts: list[dict[str, Any]]) -> str:
    """Markdown for the Theorizer's artifacts: their text as is, and structured data rendered
    as headed sections."""
    sections: list[str] = []
    for artifact in artifacts:
        for part in artifact.get("parts") or []:
            if not isinstance(part, dict):
                continue
            if isinstance(part.get("text"), str) and part["text"].strip():
                sections.append(part["text"].strip())
            elif part.get("data") is not None:
                sections.append(_render(part["data"]))
    return "\n\n".join(s for s in sections if s) or "The Theorizer finished without theories."


def _render(value: Any, depth: int = 0) -> str:
    """Readable Markdown for nested JSON whose exact shape the Theorizer does not document."""
    if isinstance(value, dict):
        lines = []
        for key, item in value.items():
            label = str(key).replace("_", " ").capitalize()
            if isinstance(item, (dict, list)):
                lines.append(f"{'#' * min(depth + 3, 6)} {label}" if depth < 2 else f"**{label}**")
                lines.append(_render(item, depth + 1))
            elif item not in (None, ""):
                lines.append(f"**{label}:** {item}")
        return "\n\n".join(lines)
    if isinstance(value, list):
        rendered = []
        for item in value:
            text = _render(item, depth + 1)
            rendered.append(text if isinstance(item, dict) else f"- {text}")
        return "\n".join(rendered)
    return str(value)


def _task_summary(task: dict[str, Any]) -> tuple[Any, str, tuple[str, ...]]:
    """What identifies a change in a Theorizer task: its state, status text and artifacts."""
    names = tuple(str(a.get("name") or "") for a in task.get("artifacts") or [])
    return ((task.get("status") or {}).get("state"), _status_text(task), names)


def _log_task(task: dict[str, Any]) -> None:
    """Logs a Theorizer task's ID, state, status text and artifact names, never its results."""
    state, text, names = _task_summary(task)
    print(
        f"[asta] theorizer task {task.get('id')} kind={task.get('kind')} state={state} "
        f"status={text[:120]!r} artifacts={list(names)}",
        file=sys.stderr,
        flush=True,
    )


def _log_shape(label: str, value: Any) -> None:
    """Logs the keys (never the values) of a response, for checking against what the
    adapters expect."""

    def shape(item: Any, depth: int = 0) -> Any:
        if depth > 3:
            return "…"
        if isinstance(item, dict):
            return {k: shape(v, depth + 1) for k, v in item.items()}
        if isinstance(item, list):
            return [shape(item[0], depth + 1)] if item else []
        return type(item).__name__

    print(f"[asta] {label}: {json.dumps(shape(value))}", file=sys.stderr, flush=True)
