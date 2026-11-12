"""Runs prompt-based Traits: instructions as system prompt, the message and a list of the
Conversation's files and components as user prompt; the model reads them with tools."""

import json
import sys
import traceback
from typing import Any, AsyncIterator

from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)

from mini_me_sidecar import debug
from mini_me_sidecar.adapters.base import Adapter, AdapterInfo
from mini_me_sidecar.adapters.providers import PROVIDER_NAMES, chat_model, provider_error
from mini_me_sidecar.context import CallContext, Model, TraitError
from mini_me_sidecar.tools import CONVERSATION_TOOLS, DEFAULT_TOOLS, THREAD_TOOLS

MAX_MATERIAL_CHARS = 400_000

# Who the model works for, as some Traits' instructions name only their task. It is no way past
# a provider's safety filter: some models still decline plant-pathogen requests with it.
RESEARCH_CONTEXT = (
    "You work for scientists at the International Potato Center (CIP), a CGIAR research "
    "centre. Their work is agricultural research on potato, sweetpotato and other root and "
    "tuber crops: breeding, agronomy, soil and climate, food security, and plant health, "
    "including plant diseases, their pathogens and pests and how to control them."
)

# Without it, models tend to open with a title restating the request.
REPLY_RULE = (
    "Start directly with your answer, with no title, heading or introduction that restates "
    "the request."
)

# For a later Step: without it, a Step such as Experiment says the message has no hypothesis
# even when an earlier Step's output states one.
WORKFLOW_RULE = (
    "You are one Step of {name}'s Workflow. The outputs of its earlier Steps come before the "
    "user's message: treat them together with the message as your material, and write your "
    "part of the answer from them. Do not comment on what the user's message alone lacks."
)

FILES_RULE = (
    "The files and Interactive Components of this Conversation are listed after the user's "
    "message, newest first, with their IDs but without their content. When the answer depends "
    "on one, read it with read_file or read_component first; never guess what it contains."
)

# How many times to ask before giving up on a model that answers with no text at all.
EMPTY_ANSWER_TRIES = 2

# The most rounds of a call in which the model calls tools; the next round must answer.
MAX_TOOL_ROUNDS = 8

# Tool-result characters one call sends, across rounds: three full reads of a file or component.
MAX_TOOL_RESULT_CHARS = 300_000

# Sent after the last tool round. Tools stay offered, since some providers reject a chat with
# tool calls but no tools; further tool calls are ignored.
LAST_ROUND = (
    "You have used all the tool calls this reply may make. Answer now with what you have, "
    "without calling tools."
)

# Between rounds' texts, so Markdown in a later round still starts on its own line.
PARAGRAPH_BREAK = "\n\n"

# The most files, and the most components, listed for the model.
MAX_LISTED = 50

# Finish reasons of a provider's safety filter; asking again gets the same verdict.
REFUSED = {"content_filter", "refusal"}


class Prompt(Adapter):
    info = AdapterInfo(
        id="prompt",
        description="Answers with an AI model, following the Trait's instructions.",
        input_schema={
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
        },
        providers=tuple(PROVIDER_NAMES),
    )

    async def run(self, ctx: CallContext, input: dict[str, Any]) -> None:
        model = ctx.model
        if model is None or not model.model:
            raise TraitError("model_not_set", "Choose an AI model in Settings first.")
        if model.provider not in PROVIDER_NAMES:
            raise TraitError("provider_unavailable", f"Unknown provider {model.provider!r}.")
        # Imported here: the tools load pandas, which the sidecar starts without.
        from mini_me_sidecar.tools.model import MODEL_TOOLS

        text = str(input.get("text", ""))
        if len(text) > MAX_MATERIAL_CHARS:
            raise TraitError(
                "input_too_large",
                f"This is {len(text):,} characters; the limit is {MAX_MATERIAL_CHARS:,}.",
            )
        material = _material(
            text, await ctx.results(), ctx.message, ctx.document, ctx.file, ctx.mini_mes
        )
        earlier = await _earlier_turns(ctx) if ctx.needs_context is not False else []
        key = await ctx.secret(model.provider)
        instructions = _system_prompt(ctx.mini_me_name, bool(ctx.steps), ctx.trait.instructions)
        messages = _messages(_merged(_turns(instructions, earlier, ctx.steps, material)))

        names = _offered(ctx.trait.tools, ctx.document is not None)
        offered = {n: MODEL_TOOLS[n] for n in names if n in MODEL_TOOLS}
        chat = chat_model(model, key.reveal()).bind_tools([t.schema() for t in offered.values()])

        await _converse(ctx, chat, messages, model, offered)


async def _converse(
    ctx: CallContext,
    chat: Any,
    messages: list[BaseMessage],
    model: Model,
    offered: dict[str, Any],
) -> None:
    """Asks until the model answers without tools, running its calls for `MAX_TOOL_ROUNDS`."""
    tool_rounds = 0
    wrote = False
    results_size = 0
    while not ctx.cancelled.is_set():
        last = tool_rounds >= MAX_TOOL_ROUNDS
        if last:
            messages.append(HumanMessage(LAST_ROUND))
        reply = await _answer(ctx, chat, messages, model, separate=wrote)
        if reply is None:
            return
        said = bool(str(reply.text))
        wrote = wrote or said
        if not _has_calls(reply):
            return
        if last:
            if said:
                return
            raise TraitError(
                "tool_rounds_used",
                f"{model.model} kept calling tools after using all {MAX_TOOL_ROUNDS} rounds "
                "of tool calls, without answering. Try again, or choose another model in "
                "Settings.",
            )
        tool_rounds += 1
        messages.append(reply)
        for call in reply.tool_calls:
            if ctx.cancelled.is_set():
                return
            result = await _run_tool(ctx, offered, call)
            if results_size + len(result) > MAX_TOOL_RESULT_CHARS:
                result = _over_budget(len(result), MAX_TOOL_RESULT_CHARS - results_size)
            results_size += len(result)
            debug.record_tool(str(call.get("name")), call.get("args"), result)
            messages.append(ToolMessage(content=result, tool_call_id=call["id"]))
        # Providers expect a result for every call the reply holds, malformed ones included.
        for call in reply.invalid_tool_calls:
            if call.get("id"):
                messages.append(ToolMessage(content=_malformed(call), tool_call_id=call["id"]))


def _offered(listed: tuple[str, ...], in_thread: bool) -> list[str]:
    """The default tools then the Trait's, with thread tools only inside a comment thread and
    Conversation tools only outside one."""
    names = [*DEFAULT_TOOLS, *(t for t in listed if t not in DEFAULT_TOOLS)]
    left_out = CONVERSATION_TOOLS if in_thread else THREAD_TOOLS
    return [n for n in names if n not in left_out]


def _over_budget(size: int, left: int) -> str:
    """Told to the model instead of a result of `size` characters, more than the `left` ones."""
    return json.dumps(
        {
            "error": f"This result has {size:,} characters, more than the {max(left, 0):,} "
            "left for tool results in this reply. Answer with what you have read, or read a "
            "smaller part."
        }
    )


def _has_calls(reply: AIMessage) -> bool:
    return bool(reply.tool_calls or reply.invalid_tool_calls)


def _malformed(call: dict[str, Any]) -> str:
    """The result told to the model for a tool call whose arguments are not a JSON object."""
    detail = f" ({call['error']})" if call.get("error") else ""
    return json.dumps(
        {
            "error": f"The arguments for {call.get('name')} were not a JSON object{detail}. "
            "Call it again with a JSON object as its arguments."
        },
        ensure_ascii=False,
    )


async def _answer(
    ctx: CallContext,
    chat: Any,
    messages: list[BaseMessage],
    model: Model,
    separate: bool = False,
) -> AIMessage | None:
    """One round: streams text into the call and returns the whole message, or None if cancelled.
    Asks again on an empty answer; with `separate`, the text starts a new paragraph."""
    name = PROVIDER_NAMES[model.provider]
    for _ in range(EMPTY_ANSWER_TRIES):
        wrote = False
        ending: dict[str, Any] = {}
        reply: Any = None
        try:
            async for chunk, metadata in _stream(chat, messages):
                if ctx.cancelled.is_set():
                    return None
                # `text` joins the chunk's text blocks, whatever shape the provider sends.
                if text := str(chunk.text):
                    if separate and not wrote:
                        ctx.write(PARAGRAPH_BREAK)
                    ctx.write(text)
                    wrote = True
                ending.update(metadata)
                reply = chunk if reply is None else reply + chunk
        except TraitError:
            raise
        except Exception as error:
            raise provider_error(error, model) from None
        if wrote and _filtered(ending):
            print(f"[prompt] {name} stopped an answer: {ending}", file=sys.stderr, flush=True)
            raise TraitError(
                "provider_refused",
                f"{name}'s content filter stopped {model.model} partway through this "
                "answer. Rephrase it, ask in a new Conversation, or choose another model "
                "in Settings.",
            )
        if wrote or (reply is not None and _has_calls(reply)):
            return reply
        # Some providers end a stream empty, reporting a failure only in the finish reason.
        print(f"[prompt] {name} sent an empty answer: {ending}", file=sys.stderr, flush=True)
        if _filtered(ending):
            raise TraitError(
                "provider_refused",
                f"{model.model} declined to answer: {name}'s content filter stopped it. "
                "Rephrase it, ask in a new Conversation, or choose another model in "
                "Settings.",
            )
    raise TraitError(
        "provider_empty",
        f"{name} sent an empty answer twice. Try again, or choose another model in Settings.",
    )


async def _run_tool(ctx: CallContext, offered: dict[str, Any], call: dict[str, Any]) -> str:
    """Runs one tool call and returns its result, or its failure, as JSON for the model."""
    tool = offered.get(str(call.get("name")))
    if tool is None:
        return json.dumps({"error": f"There is no tool called {call.get('name')!r}."})
    try:
        result = await tool.call(ctx, call.get("args") or {})
    except TraitError as error:
        # The reply ended: nothing further can be saved or shown.
        if error.code == "call_not_active":
            raise
        return json.dumps({"error": str(error)}, ensure_ascii=False)
    except Exception:
        # A fault in the tool: logged, and the model is told only that it failed.
        print(f"[prompt] {tool.name} failed:", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        return json.dumps({"error": f"{tool.name} failed unexpectedly."})
    return json.dumps(result, ensure_ascii=False, default=str)


def _material(
    text: str,
    results: dict[str, Any],
    message: dict[str, Any] | None = None,
    document: dict[str, Any] | None = None,
    picked: dict[str, Any] | None = None,
    mini_mes: list[dict[str, Any]] | None = None,
) -> str:
    """The user prompt: a comment's passage of `document`, `text`, the Conversation's files
    (marking routing's `picked`) and components by ID without content, the components `message`
    references with `$`, and the Mini-Mes to hand off to."""
    files = (results.get("assets") or [])[:MAX_LISTED]
    picked_id = (picked or {}).get("asset_id")
    components = (results.get("components") or [])[:MAX_LISTED]
    parts = []
    if document:
        parts.append(
            f"This comment is about a passage of the document {document.get('name')} "
            f"(ID: {document.get('asset_id')}), which read_file reads in full:\n"
            f'"""\n{document.get("passage", "")}\n"""'
        )
    parts.append(text)
    if files:
        lines = [
            f"- {f.get('name')} (ID: {f.get('id')})"
            + (" — in this message" if f.get("current") else "")
            + (" — probably the file the user means" if f.get("id") == picked_id else "")
            for f in files
        ]
        parts.append("Files in this Conversation:\n" + "\n".join(lines))
    if components:
        lines = [
            f"- {c.get('kind')} from {c.get('author')} (ID: {c.get('id')})"
            + (" — in this message" if c.get("current") else "")
            for c in components
        ]
        parts.append("Interactive Components in this Conversation:\n" + "\n".join(lines))
    references = [
        c for c in (message or {}).get("text_components") or [] if c.get("kind") == "component"
    ]
    if references:
        kinds = {c.get("id"): c.get("kind") for c in results.get("components") or []}
        lines = [
            f"- {c.get('label')}: the {kinds.get(c.get('id'), 'component')} with ID {c.get('id')}"
            for c in references
        ]
        parts.append(
            "Components referenced in this message, to read with read_component:\n"
            + "\n".join(lines)
        )
    if mini_mes:
        lines = [f"- {m.get('name')}: {m.get('description')}" for m in mini_mes]
        parts.append("Mini-Mes you can hand off to:\n" + "\n".join(lines))
    return "\n\n".join(p for p in parts if p)


async def _earlier_turns(ctx: CallContext) -> list[tuple[str, str]]:
    """Earlier messages as chat turns; other Mini-Mes' replies go on the user's side, because
    models copy any name prefix they see on their own turns."""
    history = await ctx.history()
    turns: list[tuple[str, str]] = []
    for entry in history.get("messages") or []:
        content = str(entry.get("content", ""))
        files = entry.get("files") or []
        if files:
            content += f"\n(files: {', '.join(files)})"
        if entry.get("author") == "user":
            turns.append(("human", content))
            continue
        if not entry.get("complete", True):
            content += " [stopped before finishing]"
        name = entry.get("name")
        if name == ctx.mini_me_name:
            turns.append(("ai", content))
        else:
            turns.append(("human", f"{name} replied:\n{content}"))
    # Also keeps the chat from opening with an assistant turn, which some providers reject.
    if history.get("truncated") or (turns and turns[0][0] == "ai"):
        turns.insert(0, ("human", "(earlier messages were left out)"))
    return turns


def _system_prompt(mini_me_name: str | None, in_workflow: bool, instructions: str | None) -> str:
    """Who the model is and works for, how to reply, then the Trait's instructions."""
    preamble = f"{RESEARCH_CONTEXT} {REPLY_RULE}"
    if mini_me_name:
        preamble = f"You are {mini_me_name}, a Mini-Me. {preamble}"
        if in_workflow:
            preamble += " " + WORKFLOW_RULE.format(name=mini_me_name)
    elif in_workflow:
        preamble += " " + WORKFLOW_RULE.format(name="this Mini-Me")
    return f"{preamble} {FILES_RULE}\n\n{instructions or ''}"


def _filtered(ending: dict[str, Any]) -> bool:
    """Whether the provider ended the stream because a content filter or refusal stopped it."""
    return ending.get("finish_reason") in REFUSED or ending.get("stop_reason") in REFUSED


def _turns(
    instructions: str,
    earlier: list[tuple[str, str]],
    steps: list[dict[str, Any]],
    material: str,
) -> list[tuple[str, str]]:
    """Instructions, earlier messages, earlier Steps' outputs, then the material."""
    turns = [("system", instructions), *earlier]
    if steps:
        parts = [f"--- {s.get('name', '')} ---\n{s.get('output', '')}" for s in steps]
        intro = "Outputs of the earlier Steps of your Workflow for this message:"
        turns.append(("human", "\n\n".join([intro, *parts])))
    turns.append(("human", material))
    return turns


def _merged(turns: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Joins consecutive same-role turns, since Anthropic and Google expect roles to alternate."""
    merged: list[tuple[str, str]] = []
    for role, content in turns:
        if merged and merged[-1][0] == role and role != "system":
            merged[-1] = (role, f"{merged[-1][1]}\n\n{content}")
        else:
            merged.append((role, content))
    return merged


def _messages(turns: list[tuple[str, str]]) -> list[BaseMessage]:
    """`turns` as LangChain messages, which tool calls and their results can follow."""
    kinds = {"system": SystemMessage, "human": HumanMessage, "ai": AIMessage}
    return [kinds[role](content) for role, content in turns]


# Chunk metadata worth logging when an answer is empty; none of it holds the key or text.
ENDING_FIELDS = ("finish_reason", "stop_reason", "model_name", "error")


async def _stream(
    chat: Any, messages: list[BaseMessage]
) -> AsyncIterator[tuple[Any, dict[str, Any]]]:
    """Each chunk with its finish reason, model name and token counts, when sent."""
    async for chunk in chat.astream(messages):
        metadata = getattr(chunk, "response_metadata", None) or {}
        ending = {k: metadata[k] for k in ENDING_FIELDS if metadata.get(k) is not None}
        if usage := getattr(chunk, "usage_metadata", None):
            ending["usage"] = dict(usage)
        yield chunk, ending
