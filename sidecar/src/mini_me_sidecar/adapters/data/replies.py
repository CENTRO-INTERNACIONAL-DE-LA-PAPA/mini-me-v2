"""How each data Trait answers: reads the tables, has the model pick from the catalogue when
needed, computes, and replies with text, `table` or `chart` components and saved files."""

from typing import Any

import pandas as pd
from pydantic import BaseModel

from mini_me_sidecar.adapters.data.catalogue import (
    CheckPlan,
    CleanPlan,
    JoinPlan,
    describe_entry,
    problem,
)
from mini_me_sidecar.adapters.data.charts import ChartDescription, check_chart
from mini_me_sidecar.adapters.data.templates import (
    ChartChoice,
    ChartPlan,
    choice_problem,
    fill_template,
    templates_text,
)
from mini_me_sidecar.adapters.data.choose import choose
from mini_me_sidecar.adapters.data.clean import apply_actions, log_frame
from mini_me_sidecar.adapters.data.describe import describe
from mini_me_sidecar.adapters.data.join import join, shared_key
from mini_me_sidecar.adapters.data.plot import ChartResult, build_chart, chart_text
from mini_me_sidecar.adapters.data.profile import profile as profile_frame
from mini_me_sidecar.adapters.data.profile import summary
from mini_me_sidecar.adapters.data.tables import (
    NO_TABLE,
    Table,
    column_type,
    fallback_source,
    table_file,
    table_sources,
)
from mini_me_sidecar.adapters.data.validate import results_frame, run_checks
from mini_me_sidecar.adapters.data.worker import WORKERS
from mini_me_sidecar.context import CallContext, CoreRequestError, TraitError
from mini_me_sidecar.tools.base import ToolError
from mini_me_sidecar.tools.components import show_chart
from mini_me_sidecar.tools.files import MAX_FILE_BYTES, save_file
from mini_me_sidecar.tools.tables import read_table, show_frame


async def profile(ctx: CallContext, text: str) -> None:
    tables = await read_tables(ctx, text)
    for table in tables:
        ctx.progress(f"Profiling {table.name}")
        columns = await WORKERS.run(ctx, profile_frame, table.frame)
        ctx.write(_sheet_note(table) + summary(table.name, table.frame) + "\n\n")
        await show_frame(
            ctx, columns, f"Columns of {table.name}", results_name=f"{table.stem}-profile.csv"
        )


async def validate(ctx: CallContext, text: str) -> None:
    tables = await read_tables(ctx, text)
    plan, malformed = await choose(ctx, CheckPlan, text, [describe(t) for t in tables])
    usable = {id(c) for t in tables for c in plan.checks if not problem(c, _columns(t))}
    ignored = [c for c in plan.checks if id(c) not in usable]
    for table in tables:
        ctx.progress(f"Checking {table.name}")
        checks = [c for c in plan.checks if not problem(c, _columns(table))]
        results, report = await WORKERS.run(ctx, run_checks, table.frame, table.name, checks)
        failed = sum(r.result != "Passed" for r in results)
        ctx.write(
            _sheet_note(table)
            + f"Ran {len(results)} checks on `{table.name}`: "
            + (f"{failed} failed." if failed else "all passed.")
            + "\n\n"
        )
        await show_frame(
            ctx,
            results_frame(results),
            f"Checks on {table.name}",
            results_name=f"{table.stem}-checks.csv",
        )
        await save_file(ctx, f"{table.stem}-validation.html", "text/html", report.encode())
    _write_ignored(ctx, malformed + [(describe_entry(c), _why(c, tables)) for c in ignored])


async def clean(ctx: CallContext, text: str) -> None:
    table = (await read_tables(ctx, text))[0]
    plan, malformed = await choose(ctx, CleanPlan, text, [describe(table)])
    ctx.progress(f"Cleaning {table.name}")
    cleaned, log = await WORKERS.run(ctx, apply_actions, table.frame, plan.actions)
    applied = [a for a in log if not a.note]
    ctx.write(
        _sheet_note(table)
        + f"Applied {len(applied)} of {len(log)} actions to `{table.name}`. "
        + f"The result has {len(cleaned):,} rows and {cleaned.shape[1]:,} columns.\n\n"
    )
    for entry in log:
        if entry.note:
            ctx.write(f"- {entry.action}: {entry.note}\n")
    _write_ignored(ctx, malformed)
    source = await _save(ctx, table, cleaned, "cleaned")
    await show_frame(
        ctx, log_frame(log), "Cleaning actions", results_name=f"{table.stem}-cleaning-log.csv"
    )
    await show_frame(ctx, cleaned, f"Cleaned {table.name}", source)


async def join_tables(ctx: CallContext, text: str) -> None:
    # Joining needs two tables the user chose, so one guessed table would not help.
    tables = await read_tables(ctx, text, fallback=False)
    if len(tables) < 2:
        raise TraitError("two_tables", "Reference or attach two tables to join.")
    left, right = tables[0], tables[1]
    if ctx.model is not None and ctx.model.model:
        descriptions = [describe(left, values=False), describe(right, values=False)]
        plan, _ = await choose(ctx, JoinPlan, text, descriptions)
    elif (plan := shared_key(left.frame, right.frame)) is None:
        raise TraitError(
            "model_not_set",
            "Choose an AI model in Settings first: the tables don't share exactly one "
            "column to join on.",
        )
    ctx.progress(f"Joining {left.name} and {right.name}")
    result, stats = await WORKERS.run(ctx, join, left.frame, right.frame, plan, right.stem)
    keys = ", ".join(f"`{k}`" for k in plan.left_on)
    ctx.write(
        f"Joined `{left.name}` ({stats.left_rows:,} rows) with `{right.name}` "
        f"({stats.right_rows:,} rows) on {keys}, as a {plan.how} join: "
        f"{stats.rows:,} rows.\n\n"
        f"- Keys in `{left.name}` without a match: {stats.left_unmatched:,}\n"
        f"- Keys in `{right.name}` without a match: {stats.right_unmatched:,}\n"
    )
    source = await _save(ctx, left, result, "joined", csv_only=True)
    await show_frame(ctx, result, f"{left.stem} joined with {right.stem}", source)


PICKED_CHART = "The chart the message refers to, which the new chart is based on:\n"


async def plot(ctx: CallContext, text: str) -> None:
    tables = await read_tables(ctx, text)
    table = tables[0]
    picked = await _picked_chart_text(ctx)
    extra = templates_text() + (f"\n\n{PICKED_CHART}{picked}" if picked else "")
    plan, malformed = await choose(ctx, ChartPlan, text, [describe(table)], extra)
    types = {str(c): column_type(table.frame[c]) for c in table.frame.columns}
    drawn, ignored = _fill_choices(plan.charts, table.frame, types)
    ignored = malformed + ignored
    _write_plot_intro(ctx, tables, len(drawn))
    results = []
    for choice, chart in drawn:
        ctx.progress(f"Drawing {chart.title or 'a chart'}")
        result = await WORKERS.run(ctx, build_chart, table.frame, chart)
        if table.source_id:
            result.data.update(source=table.name)
        notes = "; ".join(result.notes)
        ctx.write(f"- {result.data['title']}" + (f": {notes}" if notes else "") + "\n")
        ignored += result.ignored
        results.append((choice, result))
    if drawn:
        ctx.write("\n")
    for choice, result in results:
        await _show_chart(ctx, result, chart_text(result.data, choice), table.source_id)
    _write_ignored(ctx, ignored, "Not drawn")


def _fill_choices(
    choices: list[ChartChoice], frame: pd.DataFrame, types: dict[str, str]
) -> tuple[list[tuple[ChartChoice, ChartDescription]], list[tuple[str, str]]]:
    """Each choice whose slots fit the table, as its filled and checked chart, and what was
    ignored with the reasons."""
    drawn, ignored = [], []
    for choice in choices:
        reason = choice_problem(choice, types)
        if reason is not None:
            ignored.append((f'chart "{choice.title}"', reason))
            continue
        chart, styles = fill_template(choice, frame)
        checked = check_chart(chart, types)
        ignored += styles + checked.ignored
        if checked.chart is not None:
            drawn.append((choice, checked.chart))
    return drawn, ignored


async def _picked_chart_text(ctx: CallContext) -> str | None:
    """The text of the chart Jev picked for this reply, if it picked one."""
    if not ctx.picked_component:
        return None
    try:
        component = await ctx.read_component(str(ctx.picked_component.get("component_id")))
    except CoreRequestError:
        return None
    return str(component.get("text") or "") if component.get("kind") == "chart" else None


def _write_plot_intro(ctx: CallContext, tables: list[Table], drawn: int) -> None:
    table = tables[0]
    ctx.write(_sheet_note(table))
    unused = [t.name for t in tables[1:]]
    if unused:
        ctx.write(
            f"Plot draws one table at a time, so this reply uses `{table.name}` and not "
            + ", ".join(f"`{name}`" for name in unused)
            + ".\n\n"
        )
    if not drawn:
        ctx.write(f"None of the charts the AI model chose fit `{table.name}`.\n\n")
    else:
        ctx.write(f"Drew {drawn} chart{'s' if drawn > 1 else ''} of `{table.name}`:\n")


async def _show_chart(
    ctx: CallContext, result: ChartResult, text: str, source_id: str | None
) -> None:
    """Shows the chart, or writes its text when it is too large or the core refuses it."""
    if result.fits:
        try:
            await show_chart(ctx, result.data, text, source_id)
            return
        except ToolError:
            pass
    ctx.write(text + "\n\n")


async def read_tables(ctx: CallContext, text: str, fallback: bool = True) -> list[Table]:
    """The tables the message points to, in order, or with `fallback` the picked or newest
    table, named in the reply. Raises `no_table` when there is none."""
    sources = table_sources(ctx.message)
    if not sources and fallback:
        found = fallback_source(ctx.file, (await ctx.results()).get("assets") or [])
        if found is not None:
            source, note = found
            ctx.write(note + "\n\n")
            sources = [source]
    tables = [await read_table(ctx, source.asset_id, source.name, text) for source in sources]
    if not tables:
        raise TraitError("no_table", NO_TABLE)
    return tables


async def _save(
    ctx: CallContext, table: Table, frame: pd.DataFrame, suffix: str, csv_only: bool = False
) -> dict[str, Any] | None:
    """Saves `frame` as a new Asset: its `{ asset_id, name }`, or None when over 32 MiB."""
    name, media, data = await WORKERS.run(ctx, table_file, table, frame, suffix, csv_only)
    if len(data) > MAX_FILE_BYTES:
        ctx.write(f"\nThe result is larger than 32 MiB, so `{name}` could not be saved.\n")
        return None
    return await save_file(ctx, name, media, data)


def _sheet_note(table: Table) -> str:
    if table.sheet is None:
        return ""
    others = [s for s in table.sheets if s != table.sheet]
    note = f'Read the sheet "{table.sheet}" of `{table.name}`'
    if others:
        note += " (it also has " + ", ".join(f'"{s}"' for s in others) + ")"
    return note + ". "


def _write_ignored(
    ctx: CallContext, ignored: list[tuple[str, str]], heading: str = "Not run"
) -> None:
    if ignored:
        ctx.write(f"{heading}, because the AI model's choice didn't fit the data:\n")
        for label, reason in ignored:
            ctx.write(f"- {label}: {reason}\n")
        ctx.write("\n")


def _why(entry: BaseModel, tables: list[Table]) -> str:
    return problem(entry, _columns(tables[0])) or "it fits none of the tables"


def _columns(table: Table) -> list[str]:
    return [str(c) for c in table.frame.columns]
