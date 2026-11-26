"""How each data Trait answers: reads the tables, has the model pick from the catalogue when
needed, computes, and replies with text, `table` or `chart` components and saved files."""

from typing import Any

import pandas as pd
from pydantic import BaseModel

from mini_me_sidecar.adapters.data.catalogue import (
    CheckPlan,
    CleanPlan,
    ColumnsPlan,
    CorrelationPlan,
    JoinPlan,
    OutlierPlan,
    describe_entry,
    pick_columns,
    problem,
)
from mini_me_sidecar.adapters.data.charts import ChartDescription
from mini_me_sidecar.adapters.data.templates import (
    ChartChoice,
    ChartPlan,
    choice_problem,
    fill_template,
    slots_text,
    suggestions,
    templates_text,
    unplaced_columns,
)
from mini_me_sidecar.adapters.data.choose import UnusableAnswer, choose
from mini_me_sidecar.adapters.data.clean import apply_actions, log_frame
from mini_me_sidecar.adapters.data.correlations import compared, correlations
from mini_me_sidecar.adapters.data.describe import describe
from mini_me_sidecar.adapters.data.join import join, shared_key
from mini_me_sidecar.adapters.data.outliers import detect
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
from mini_me_sidecar.adapters.data.variables import KINDS, MAX_CHARTS, chart_columns, summaries
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
    left_out = malformed + [(describe_entry(c), _why(c, tables)) for c in ignored]
    _write_ignored(ctx, left_out, "I didn't run these checks:")


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
    _write_ignored(ctx, malformed, "I didn't apply these actions:")
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
    types = {str(c): column_type(table.frame[c]) for c in table.frame.columns}
    try:
        plan, malformed = await choose(ctx, ChartPlan, text, [describe(table)], extra)
    except UnusableAnswer as error:
        ctx.write(_sheet_note(table) + _unusable_text(table.name))
        ctx.write("".join(f"{line}.\n\n" for line in suggestions(None, types)))
        _write_ignored(ctx, error.malformed, "I left these out:")
        return
    drawn, ignored = _fill_choices(plan.charts, table.frame, types)
    ignored = malformed + ignored
    _write_plot_intro(ctx, tables, len(drawn))
    results = []
    for choice, chart in drawn:
        result = await _build(ctx, table.frame, chart, table.name if table.source_id else None)
        drew = f"{choice.template} chart, {slots_text(choice)}"
        notes = "".join(f"; {note}" for note in result.notes)
        ctx.write(f"- {result.data['title']}: {drew}{notes}\n")
        ignored += result.ignored
        results.append((choice, result))
    if drawn:
        ctx.write("\n")
    for choice, result in results:
        await _show_chart(ctx, result, chart_text(result.data, choice), table.source_id)
    heading = f"I couldn't draw this from `{table.name}`:" if not drawn else "I left these out:"
    _write_ignored(ctx, ignored, heading)


async def describe_variables(ctx: CallContext, text: str) -> None:
    tables = await read_tables(ctx, text)
    table = tables[0]
    plan, malformed = await choose(ctx, ColumnsPlan, text, [describe(table)])
    columns, left_out = pick_columns(table.frame, plan.columns, KINDS)
    if not columns:
        raise TraitError("no_columns", f"None of the columns named are in `{table.name}`.")
    ctx.progress(f"Describing {table.name}")
    found = await WORKERS.run(ctx, summaries, table.frame, columns)
    charted, uncharted = await WORKERS.run(ctx, chart_columns, table.frame, columns)
    kinds = [f"{len(frame)} {kind}" for kind, frame in found.items()]
    ctx.write(
        _table_note(tables)
        + f"Described {len(columns)} column{'s' if len(columns) != 1 else ''} of "
        + f"`{table.name}`: {_listed(kinds)}.\n\n"
    )
    for kind, frame in found.items():
        await show_frame(
            ctx,
            frame,
            f"{kind.capitalize()} columns of {table.name}",
            results_name=f"{table.stem}-{kind}-columns.csv",
        )
    for column, template in charted:
        title = f"Distribution of {column}" if template == "histogram" else f"Rows per {column}"
        slot = "value" if template == "histogram" else "category"
        choice = ChartChoice.model_validate({"template": template, "title": title, slot: column})
        source = table.name if table.source_id else None
        await _draw(ctx, table.frame, choice, source, table.source_id)
    _write_ignored(ctx, [(f"`{c}`", why) for c, why in uncharted], "I didn't chart:")
    _write_ignored(ctx, malformed + left_out, "I left these out:")


STRONGEST = 3


async def find_correlations(ctx: CallContext, text: str) -> None:
    tables = await read_tables(ctx, text)
    table = tables[0]
    plan, malformed = await choose(ctx, CorrelationPlan, text, [describe(table)])
    columns, left_out = pick_columns(table.frame, plan.columns, ("number",))
    if len(columns) < 2:
        raise TraitError(
            "too_few_columns",
            f"Correlations need at least two number columns, and I found {len(columns)} "
            f"to use in `{table.name}`.",
        )
    ctx.progress(f"Correlating {table.name}")
    pairs = await WORKERS.run(ctx, correlations, table.frame, columns, plan.method)
    strongest = pairs.dropna(subset=["Coefficient"]).head(STRONGEST)
    named = [
        f"`{p['Column A']}` and `{p['Column B']}` ({p['Coefficient']:.2f})"
        for _, p in strongest.iterrows()
    ]
    coefficient = "Pearson's" if plan.method == "pearson" else "Spearman's rank"
    ctx.write(
        _table_note(tables)
        + f"Correlated {len(columns)} number columns of `{table.name}` pairwise with "
        + f"{coefficient} coefficient."
        + (f" The strongest: {_listed(named)}." if named else " No pair has a coefficient.")
        + " A correlation shows that two columns move together, not that one causes the other."
        + "\n\n"
    )
    await show_frame(
        ctx, pairs, f"Correlations in {table.name}", results_name=f"{table.stem}-correlations.csv"
    )
    source = table.name if table.source_id else None
    values = await WORKERS.run(ctx, compared, table.frame, columns, plan.method)
    heatmap = ChartChoice.model_validate(
        {
            "template": "correlation_heatmap",
            "title": f"{coefficient.split()[0]} correlations",
            "correlated_columns": columns,
        }
    )
    await _draw(ctx, values, heatmap, source, table.source_id)
    for _, pair in strongest.iterrows():
        a, b = pair["Column A"], pair["Column B"]
        scatter = ChartChoice.model_validate(
            {"template": "scatter_trend", "title": f"{b} against {a}", "x": a, "y": b}
        )
        await _draw(ctx, table.frame, scatter, source, table.source_id)
    _write_ignored(ctx, malformed + left_out, "I left these out:")


async def detect_outliers(ctx: CallContext, text: str) -> None:
    tables = await read_tables(ctx, text)
    table = tables[0]
    plan, malformed = await choose(ctx, OutlierPlan, text, [describe(table)])
    columns, left_out = pick_columns(table.frame, plan.columns, ("number",))
    if not columns:
        raise TraitError("no_columns", f"I found no number columns to check in `{table.name}`.")
    multiple = 3 if plan.extreme else 1.5
    ctx.progress(f"Checking {table.name} for outliers")
    found = await WORKERS.run(ctx, detect, table.frame, columns, multiple)
    outside = found.bounds[found.bounds["Below"] + found.bounds["Above"] > 0]
    values = int(outside["Below"].sum() + outside["Above"].sum())
    ctx.write(
        _table_note(tables)
        + f"Checked {len(columns)} number column{'s' if len(columns) != 1 else ''} of "
        + f"`{table.name}` for values more than {multiple:g} interquartile ranges beyond the "
        + f"quartiles: {values:,} value{'s' if values != 1 else ''} in {len(outside)} "
        + f"column{'s' if len(outside) != 1 else ''}."
    )
    if len(columns) > 1 and not found.notes:
        ctx.write(
            f" An Isolation Forest found {found.unusual_rows:,} row"
            + f"{'s' if found.unusual_rows != 1 else ''} unusual across the columns."
        )
    ctx.write(
        f" {len(found.flagged):,} row{'s are' if len(found.flagged) != 1 else ' is'} flagged in"
        + " all; the table is unchanged.\n\n"
        + "".join(f"{note}\n\n" for note in found.notes)
    )
    await show_frame(
        ctx,
        found.bounds,
        f"Outlier bounds in {table.name}",
        results_name=f"{table.stem}-outlier-bounds.csv",
    )
    if len(found.flagged):
        await show_frame(
            ctx,
            found.flagged,
            f"Flagged rows of {table.name}",
            results_name=f"{table.stem}-outliers.csv",
        )
    source = table.name if table.source_id else None
    for column in list(outside["Column"])[:MAX_CHARTS]:
        spread = pd.DataFrame({"Column": column, column: table.frame[column]})
        box = ChartChoice.model_validate(
            {
                "template": "box",
                "title": f"Spread of {column}",
                "category": "Column",
                "value": column,
            }
        )
        await _draw(ctx, spread, box, source, table.source_id)
    _write_ignored(ctx, malformed + left_out, "I left these out:")


async def _draw(
    ctx: CallContext,
    frame: pd.DataFrame,
    choice: ChartChoice,
    source: str | None,
    source_id: str | None,
) -> None:
    """Draws a chart the Trait chose itself, with a line for its notes when it has any."""
    chart, _ = fill_template(choice, frame)
    result = await _build(ctx, frame, chart, source)
    if result.notes:
        ctx.write(f"- {choice.title}: {'; '.join(result.notes)}\n")
    await _show_chart(ctx, result, chart_text(result.data, choice), source_id)


async def _build(
    ctx: CallContext, frame: pd.DataFrame, chart: ChartDescription, source: str | None
) -> ChartResult:
    """The chart's data, computed in a worker; `source` names the file it was drawn from."""
    ctx.progress(f"Drawing {chart.title or 'a chart'}")
    result = await WORKERS.run(ctx, build_chart, frame, chart)
    if source:
        result.data.update(source=source)
    return result


def _listed(items: list[str]) -> str:
    """`a`, `a and b`, or `a, b and c`."""
    return ", ".join(items[:-1]) + (" and " if len(items) > 1 else "") + items[-1]


def _fill_choices(
    choices: list[ChartChoice], frame: pd.DataFrame, types: dict[str, str]
) -> tuple[list[tuple[ChartChoice, ChartDescription]], list[tuple[str, str]]]:
    """Each choice whose slots fit the table, as its filled chart, and what was ignored with
    the reasons."""
    drawn, ignored = [], []
    for choice in choices:
        reason = choice_problem(choice, types)
        if reason is not None:
            offered = "".join(f"\n  - {line}" for line in suggestions(choice, types))
            ignored.append((f'"{choice.title}"', reason + offered))
            continue
        chart, styles = fill_template(choice, frame)
        ignored += styles + [
            (f"Column `{column}`", f"a {choice.template} chart has no place for it")
            for column in unplaced_columns(choice)
            if column in types
        ]
        drawn.append((choice, chart))
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


def _unusable_text(table_name: str) -> str:
    return (
        f"I couldn't make a chart of `{table_name}` from this request. Try again, perhaps "
        "naming the kind of chart and the columns to show.\n\n"
    )


def _table_note(tables: list[Table]) -> str:
    """The sheet read, and the tables not used by a Trait that reads only the first."""
    table = tables[0]
    unused = [t.name for t in tables[1:]]
    if not unused:
        return _sheet_note(table)
    return (
        _sheet_note(table)
        + f"I use one table at a time, so this reply uses `{table.name}` and not "
        + ", ".join(f"`{name}`" for name in unused)
        + ".\n\n"
    )


def _write_plot_intro(ctx: CallContext, tables: list[Table], drawn: int) -> None:
    table = tables[0]
    ctx.write(_table_note(tables))
    if drawn:
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


def _write_ignored(ctx: CallContext, ignored: list[tuple[str, str]], heading: str) -> None:
    if ignored:
        ctx.write(f"{heading}\n")
        for label, reason in ignored:
            ctx.write(f"- {label}: {reason}\n")
        ctx.write("\n")


def _why(entry: BaseModel, tables: list[Table]) -> str:
    return problem(entry, _columns(tables[0])) or "it fits none of the tables"


def _columns(table: Table) -> list[str]:
    return [str(c) for c in table.frame.columns]
