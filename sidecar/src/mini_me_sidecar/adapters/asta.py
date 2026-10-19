"""Adapters for Ai2's Asta services: Paper Finder (*Find Papers*) and the Theorizer
(*Theorize*). Both use the Ai2 account's access token, which the core refreshes; Asta's own
token storage and CLI are never used."""

import asyncio
import json
import re
import sys
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

from mini_me_sidecar.adapters.base import Adapter, AdapterInfo
from mini_me_sidecar.context import CallContext, CoreRequestError, TraitError
from mini_me_sidecar.tools.base import ToolError
from mini_me_sidecar.tools.components import show_papers, show_theories
from mini_me_sidecar.tools.files import save_file

AI2 = "ai2"

TEXT_INPUT: dict[str, Any] = {
    "type": "object",
    "properties": {"text": {"type": "string"}},
    "required": ["text"],
}

MAX_PAPERS = 20
# The most papers a `paper-sources` component holds, which keeps its data small.
MAX_SOURCES = 50

# Errors with which the core refuses a component; the reply then falls back to its text.
COMPONENT_REFUSED = {"component_not_allowed", "invalid_component"}
PAPER_FINDER_TIMEOUT_S = 300

# The Theorizer's end-to-end skill: it finds papers, extracts evidence and forms theories.
# Ai2 documents 3–8 minutes for a run, but real runs take 15–25 minutes.
THEORIZER_SKILL = "literature-theory-generation"

# Poll the Theorizer's task this often, and give up after this long.
THEORIZER_POLL_S = 5.0
THEORIZER_LIMIT_S = 60 * 60

# A failed Asta request that may succeed later (a dropped connection, or a 5xx or 429 answer)
# is tried again after each of these delays.
RETRY_DELAYS_S = (2.0, 5.0)

T = TypeVar("T")

# What the progress line says for a Theorizer task state that comes without status text.
STATE_LABELS = {"submitted": "Queued at Ai2", "working": "Working"}


class FindPapers(Adapter):
    uses_tools = ("show_papers",)
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
                ctx,
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
        papers = widget.get("results") or []
        narrative = _summary(str(widget.get("response_text") or ""))
        if not papers:
            ctx.write(papers_reply([], narrative))
            return
        count = len(papers)
        ctx.write(narrative or f"Found {count} paper{'' if count == 1 else 's'}.")
        text = papers_reply(papers, "")
        await _component_or_text(ctx, show_papers, papers_data(papers), text)


class Theorize(Adapter):
    uses_tools = ("show_theories", "save_file")
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
        ctx.progress("Starting the Theorizer (this can take 20 minutes or more)…")

        # Naming the skill keeps the request from being routed to a narrower skill that takes
        # the same input.
        envelope = {
            "kind": THEORIZER_SKILL,
            "data": {"theory_query": str(input.get("text", ""))},
        }
        # Sending is never repeated: a retry after a lost answer would start a second task.
        task = await _until_cancelled(
            ctx, lambda: _call(ctx, client.send_message, json.dumps(envelope), retry=False)
        )
        if task is None:
            return
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
            task_id = task.get("id") or ""
            polled = await _until_cancelled(ctx, lambda: _call(ctx, client.get_task, task_id))
            if polled is None:
                return
            task = polled
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
        artifacts = task.get("artifacts") or []
        _log_shape("theorizer artifacts", artifacts)
        store, texts = theory_store(artifacts)
        data = theories_data(store)
        if data is None:
            ctx.write(_without_theories(texts))
        else:
            ctx.write(theories_summary(data, store))
            await _component_or_text(ctx, show_theories, data, theories_markdown(data))
        try:
            content = json.dumps(artifacts, ensure_ascii=False).encode()
            await save_file(ctx, "theory-store.json", "application/json", content)
        except ToolError as error:
            print(f"[asta] could not save the Theory Store: {error}", file=sys.stderr, flush=True)


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


async def _call(
    ctx: CallContext, function: Callable[..., T], *args: Any, retry: bool = True, **kwargs: Any
) -> T:
    """Runs one of Asta's blocking client calls off the event loop and turns its error into
    one the user can act on. With `retry`, a failure that may pass is tried again after each
    of `RETRY_DELAYS_S`; a cancelled call stops waiting and raises the last error."""
    for delay in (*(RETRY_DELAYS_S if retry else ()), None):
        try:
            return await asyncio.to_thread(function, *args, **kwargs)
        except TraitError:
            raise
        except Exception as error:
            again = delay is not None and _transient(error)
            # The message names the request and the HTTP status, never the token.
            detail = f"{type(error).__name__}: {str(error)[:300]}"
            note = f"; trying again in {delay:g} s" if again else ""
            print(f"[asta] request failed: {detail}{note}", file=sys.stderr, flush=True)
            if not again or await _cancelled_within(ctx, delay):
                raise _asta_error(error) from None
    raise AssertionError("unreachable")


async def _cancelled_within(ctx: CallContext, seconds: float) -> bool:
    """Waits up to `seconds`, and whether the call was cancelled meanwhile."""
    try:
        await asyncio.wait_for(ctx.cancelled.wait(), seconds)
        return True
    except TimeoutError:
        return False


def _status(error: BaseException) -> int | None:
    """The HTTP status of an Asta client error: urllib's HTTPError raised directly, wrapped,
    or carried as `code`."""
    for source in (error, error.__cause__):
        code = getattr(source, "code", None)
        if isinstance(code, int):
            return code
    return None


def _transient(error: BaseException) -> bool:
    """Whether trying again may help: a dropped connection, a server error or a rate limit,
    but not a timeout (Paper Finder already waits minutes) or a refused request."""
    if _timed_out(error):
        return False
    status = _status(error)
    return status is None or status == 429 or status >= 500


def _timed_out(error: BaseException) -> bool:
    """Whether `error`, the error it wraps, or urllib's `reason` for it is a timeout."""
    causes = (error, error.__cause__, getattr(error, "reason", None))
    return any(isinstance(cause, TimeoutError) for cause in causes)


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
    if _status(error) in (401, 403):
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


def _summary(narrative: str) -> str:
    """The verdict at the top of Paper Finder's `response_text`, such as "I found 18 papers
    that look like perfect matches". The rest, after a `---` line, restates the query."""
    return re.split(r"(?m)^\s*---+\s*$", narrative, maxsplit=1)[0].strip()


async def _component_or_text(
    ctx: CallContext, show: Callable[[CallContext, Any, str], Awaitable[str]], data: Any, text: str
) -> None:
    """Shows a component with the show tool `show`, or writes `text` below the reply's first
    line when the core refuses the component."""
    try:
        await show(ctx, data, text)
    except ToolError as error:
        if error.code not in COMPONENT_REFUSED:
            raise
        print(f"[asta] component refused: {error}", file=sys.stderr, flush=True)
        ctx.write("\n\n" + text)


def _paper(paper: dict[str, Any]) -> dict[str, Any]:
    """One Paper Finder result in the fields of a `paper-sources` paper."""
    authors = [
        str(a.get("name") if isinstance(a, dict) else a) for a in (paper.get("authors") or [])
    ]
    year = _get(paper, "year")
    corpus_id = _get(paper, "corpus_id", "corpusId")
    link = _get(paper, "url") or (
        f"https://www.semanticscholar.org/p/{corpus_id}" if corpus_id else None
    )
    return {
        "title": str(_get(paper, "title") or "Untitled"),
        "authors": authors,
        "year": int(year) if str(year or "").isdigit() else None,
        "venue": str(_get(paper, "venue") or "") or None,
        "url": str(link) if link else None,
        "reason": _relevance(paper) or None,
    }


def papers_data(papers: list[dict[str, Any]]) -> dict[str, Any]:
    """The `paper-sources` version 1 data for Paper Finder's results, most relevant first."""
    return {"papers": [_paper(paper) for paper in papers[:MAX_SOURCES]]}


def papers_reply(papers: list[dict[str, Any]], narrative: str) -> str:
    """Markdown for Paper Finder's results, most relevant first."""
    if not papers:
        return "No papers were found. Try rephrasing the topic or making it more specific."
    lines = [narrative.strip(), ""] if narrative.strip() else []
    for number, paper in enumerate(map(_paper, papers[:MAX_PAPERS]), start=1):
        authors = paper["authors"]
        names = ", ".join(authors[:3]) + (" et al." if len(authors) > 3 else "")
        year = f" ({paper['year']})" if paper["year"] else ""
        heading = f"{number}. **{paper['title']}**{year}"
        details = " · ".join(str(d) for d in (names, paper["venue"], paper["url"]) if d)
        lines.append(heading + (f" — {details}" if details else ""))
        if paper["reason"]:
            lines.append(f"   {paper['reason']}")
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


def theory_store(artifacts: list[dict[str, Any]]) -> tuple[dict[str, list[Any]], list[str]]:
    """The Theorizer's Theory Store gathered by section (`theories`, `paperstore`,
    `extractionresults`, …, names reduced by `_norm`), and the text parts of its artifacts.

    The store arrives as parts that each hold some sections, and a section can appear in
    several parts as it is updated; entries are merged by their ID, a later part replacing an
    earlier one."""
    sections: dict[str, dict[str, dict[str, Any]]] = {}
    texts: list[str] = []
    for artifact in artifacts:
        for part in artifact.get("parts") or []:
            if not isinstance(part, dict):
                continue
            if isinstance(part.get("text"), str) and part["text"].strip():
                texts.append(part["text"].strip())
            if isinstance(part.get("data"), dict):
                for key, value in part["data"].items():
                    if isinstance(value, dict):
                        items = list(value.items())
                    elif isinstance(value, list):
                        items = [(None, entry) for entry in value]
                    else:
                        continue
                    section = sections.setdefault(_norm(key), {})
                    for entry_id, entry in items:
                        if not isinstance(entry, dict):
                            continue
                        # An entry without any ID is kept as a new one rather than merged.
                        found = _field(entry, "id") or _field(entry, "uuid") or entry_id
                        section[str(found) if found else f"#{len(section)}"] = entry
    return {name: list(entries.values()) for name, entries in sections.items()}, texts


def theories_data(store: dict[str, list[Any]]) -> dict[str, Any] | None:
    """The `theories` version 1 data for a Theory Store: each theory's wording, statements
    and supporting evidence, with `refs` numbering the cited papers in `references` in the
    order they are first cited. None when the store holds no theories."""
    if not store.get("theories"):
        return None
    paper_of_evidence = {
        str(_field(item, "uuid")): _paper_key(_field(result, "paper_id"))
        for result in store.get("extractionresults") or []
        for item in _entries(_field(result, "extracted_data"))
        if _field(item, "uuid") is not None
    }
    papers = {_paper_key(_field(p, "id")): p for p in store.get("paperstore") or []}
    cited: list[str] = []

    def refs(uuids: Any) -> list[int]:
        numbers: list[int] = []
        for uuid in uuids if isinstance(uuids, list) else []:
            paper = paper_of_evidence.get(str(uuid))
            if paper in papers:
                if paper not in cited:
                    cited.append(paper)
                if cited.index(paper) + 1 not in numbers:
                    numbers.append(cited.index(paper) + 1)
        return sorted(numbers)

    theories = []
    for number, theory in enumerate(store["theories"], start=1):
        # The theory's own wording sits in `components`, next to its bookkeeping.
        components = _field(theory, "components")
        if isinstance(components, list):
            components = (_entries(components)[:1] or [{}])[0]
        details = {**theory, **(components if isinstance(components, dict) else {})}
        name = _wording(details, "theory_name") or {
            "plain": str(_field(details, "name") or f"Theory {number}"),
            "technical": None,
        }
        statements = []
        for statement in map(_unwrapped, _entries(_field(details, "theory_statements"))):
            text = _wording(statement, "theory_statement")
            if not text:
                continue
            evidence = [
                {"text": str(_field(item, "text")).strip(), "refs": refs(_field(item, "uuids"))}
                for item in _entries(_field(statement, "supporting_evidence"))
                if str(_field(item, "text") or "").strip()
            ]
            statements.append({"text": text, "evidence": evidence})
        theories.append(
            {
                "name": name,
                "description": _wording(details, "theory_description"),
                "statements": statements,
            }
        )
    return {"theories": theories, "references": [_reference(papers[key]) for key in cited]}


def theories_markdown(data: dict[str, Any]) -> str:
    """Markdown for `theories` data in plain language: each theory, its statements with their
    evidence cited by number, and the cited papers at the end."""
    lines: list[str] = []
    for number, theory in enumerate(data["theories"], start=1):
        lines += [f"## {number}. {theory['name']['plain']}"]
        if theory["description"]:
            lines += ["", theory["description"]["plain"]]
        for statement in theory["statements"]:
            lines += ["", f"- **{statement['text']['plain']}**"]
            for evidence in statement["evidence"]:
                cites = f" [{', '.join(map(str, evidence['refs']))}]" if evidence["refs"] else ""
                lines.append(f"  - {evidence['text']}{cites}")
        lines.append("")
    if data["references"]:
        lines += ["**References**", ""]
        for number, reference in enumerate(data["references"], start=1):
            year = f" ({reference['year']})" if reference["year"] else ""
            link = f" — {reference['url']}" if reference["url"] else ""
            lines.append(f"{number}. **{reference['title']}**{year}{link}")
    return "\n".join(lines).strip()


def theories_reply(artifacts: list[dict[str, Any]]) -> str:
    """The whole reply as Markdown: a line counting the theories, then `theories_markdown`,
    or the artifacts' text when there are no theories."""
    store, texts = theory_store(artifacts)
    data = theories_data(store)
    if data is None:
        return _without_theories(texts)
    return theories_summary(data, store) + "\n\n" + theories_markdown(data)


def _without_theories(texts: list[str]) -> str:
    """The reply when the Theory Store holds no theories: its text parts, if any."""
    return "\n\n".join(texts) or "The Theorizer finished without theories."


def theories_summary(data: dict[str, Any], store: dict[str, list[Any]]) -> str:
    count = len(data["theories"])
    papers = len(store.get("paperstore") or [])
    from_papers = f" from {papers} paper{'' if papers == 1 else 's'}" if papers else ""
    return f"The Theorizer formed {count} theor{'y' if count == 1 else 'ies'}{from_papers}."


def _norm(key: Any) -> str:
    """A field name reduced to lowercase letters and digits, so `paper_id`, `paperId` and
    `Paper ID` match: the Theory Store mixes snake_case and camelCase."""
    return "".join(c for c in str(key).lower() if c.isalnum())


def _field(data: Any, name: str) -> Any:
    if not isinstance(data, dict):
        return None
    wanted = _norm(name)
    return next((v for k, v in data.items() if _norm(k) == wanted and v is not None), None)


def _unwrapped(statement: dict[str, Any]) -> dict[str, Any]:
    """A theory statement without the one-key wrapper naming its kind, such as `{"law": …}`."""
    if _field(statement, "theory_statement") is None and len(statement) == 1:
        inner = next(iter(statement.values()))
        if isinstance(inner, dict):
            return inner
    return statement


def _entries(value: Any) -> list[dict[str, Any]]:
    """The records in a Theory Store section, which is either a list or a dict keyed by ID."""
    items = value.values() if isinstance(value, dict) else value if isinstance(value, list) else []
    return [item for item in items if isinstance(item, dict)]


def _wording(data: dict[str, Any], name: str) -> dict[str, str | None] | None:
    """A field's `{ plain, technical }` wording; `plain` falls back to the technical text,
    and `technical` is None when only one version exists. None when the field is empty."""
    technical = str(_field(data, name) or "").strip()
    plain = str(_field(data, f"{name}_plain_language") or "").strip() or technical
    if not plain:
        return None
    return {"plain": plain, "technical": technical if technical and technical != plain else None}


def _paper_key(paper_id: Any) -> str:
    """Paper IDs appear both as `paper-<sha>` and as the bare SHA."""
    key = _norm(paper_id)
    return key.removeprefix("paper")


def _reference(paper: dict[str, Any]) -> dict[str, Any]:
    """A cited paper as a `theories` reference: title, year and a DOI or Semantic Scholar
    link."""
    metadata = _field(paper, "s2_metadata") or {}
    title = str(_field(paper, "title") or _field(metadata, "title") or "Untitled").strip()
    year = _field(paper, "publication_year") or _field(metadata, "year")
    doi = _field(_field(metadata, "external_ids"), "doi") or _field(paper, "doi")
    corpus_id = _field(paper, "corpus_id") or _field(metadata, "corpus_id")
    link = (
        f"https://doi.org/{doi}"
        if doi
        else _field(metadata, "url")
        or (f"https://www.semanticscholar.org/p/{corpus_id}" if corpus_id else None)
    )
    return {
        "title": title,
        "year": int(year) if str(year or "").isdigit() else None,
        "url": str(link) if link else None,
    }


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
    adapters expect. A list's dict items are merged into one shape, and a dict with many
    keys (records keyed by ID) shows only its first."""

    def merge(into: dict[str, Any], entry: dict[str, Any]) -> None:
        for key, val in entry.items():
            if isinstance(into.get(key), dict) and isinstance(val, dict):
                merge(into[key], val)
            else:
                into.setdefault(key, val)

    def shape(item: Any, depth: int = 0) -> Any:
        if depth > 12:
            return "…"
        if isinstance(item, dict):
            if len(item) > 30:
                first = next(iter(item.items()))
                return {f"<{len(item)} keys, first {first[0]!r}>": shape(first[1], depth + 1)}
            return {k: shape(v, depth + 1) for k, v in item.items()}
        if isinstance(item, list):
            dicts = [i for i in item if isinstance(i, dict)]
            if dicts:
                merged: dict[str, Any] = {}
                for entry in dicts:
                    merge(merged, entry)
                return [shape(merged, depth + 1)]
            return [shape(item[0], depth + 1)] if item else []
        return type(item).__name__

    print(f"[asta] {label}: {json.dumps(shape(value))}", file=sys.stderr, flush=True)
