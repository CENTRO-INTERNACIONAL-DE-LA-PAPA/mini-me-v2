"""How each data Trait answers: reads the tables, has the model pick from the catalogue when
needed, computes, and replies with text, `table` or `chart` components and saved files."""

from typing import Any

import pandas as pd
from pydantic import BaseModel

from mini_me_sidecar.adapters.data.catalogue import (
    CheckPlan,
    CleanPlan,
    ClusterPlan,
    ColumnsPlan,
    ConfoundersPlan,
    DriversPlan,
    GroupsPlan,
    CorrelationPlan,
    JoinPlan,
    OutlierPlan,
    describe_entry,
    pick_columns,
    problem,
    role_problem,
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
from mini_me_sidecar.adapters.data.clusters import cluster
from mini_me_sidecar.adapters.data.confounders import check
from mini_me_sidecar.adapters.data.correlations import compared, correlations
from mini_me_sidecar.adapters.data.describe import describe
from mini_me_sidecar.adapters.data.drivers import regress
from mini_me_sidecar.adapters.data.groups import compare
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
        ctx.write(
            _table_note(tables)
            + f"Correlations need at least two number columns, and I found {len(columns)} to "
            + f"use in `{table.name}`, so there is nothing to correlate.\n\n"
        )
        _write_ignored(ctx, malformed + left_out, "I left these out:")
        return
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
        ctx.write(
            _table_note(tables)
            + f"I found no number columns to check in `{table.name}`, so there are no outliers "
            + "to look for.\n\n"
        )
        _write_ignored(ctx, malformed + left_out, "I left these out:")
        return
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


MAX_CLUSTERS = 20


async def find_clusters(ctx: CallContext, text: str) -> None:
    tables = await read_tables(ctx, text)
    table = tables[0]
    plan, malformed = await choose(ctx, ClusterPlan, text, [describe(table)])
    columns, left_out = pick_columns(table.frame, plan.columns, ("number",))
    if len(columns) < 2:
        raise TraitError(
            "too_few_columns",
            f"Clustering needs at least two number columns, and I found {len(columns)} "
            f"to use in `{table.name}`.",
        )
    clusters = plan.clusters
    if clusters is not None and not 2 <= clusters <= MAX_CLUSTERS:
        left_out.append(
            (f"{clusters} clusters", f"a number from 2 to {MAX_CLUSTERS} is needed")
        )
        clusters = None
    ctx.progress(f"Clustering {table.name}")
    found = await WORKERS.run(ctx, cluster, table.frame, columns, plan.method, clusters)
    saved = await _save(ctx, table, found.table, "clusters", csv_only=True)
    missing = len(table.frame) - found.clustered
    ctx.write(
        _table_note(tables)
        + f"Grouped {found.clustered:,} rows of `{table.name}` by {len(columns)} columns into "
        + f"{found.clusters} clusters with {found.method}."
        + (f" {missing:,} rows weren't clustered." if missing else "")
        + "".join(f" {note}" for note in found.notes)
        + f" The first two principal components explain {found.explained[0]:g}% and "
        + f"{found.explained[1]:g}% of the variation."
        + (
            f" I saved `{saved['name']}`, which adds the columns `cluster`, `pc1` and `pc2`."
            if saved
            else ""
        )
        + "\n\n"
    )
    await show_frame(
        ctx,
        found.summary,
        f"Clusters of {table.name}",
        results_name=f"{table.stem}-cluster-summary.csv",
    )
    points = found.table[["pc1", "pc2", "cluster"]]
    scatter = ChartChoice.model_validate(
        {
            "template": "scatter",
            "title": "Clusters on the first two principal components",
            "x": "pc1",
            "y": "pc2",
            "group": "cluster",
        }
    )
    source, source_id = (saved["name"], saved["asset_id"]) if saved else (None, None)
    await _draw(ctx, points, scatter, source, source_id)
    _write_ignored(ctx, malformed + left_out, "I left these out:")


ASSOCIATION = "This shows an association, not a cause."

GROUPING = ("text", "boolean", "number")


async def compare_groups(ctx: CallContext, text: str) -> None:
    tables = await read_tables(ctx, text)
    table = tables[0]
    plan, _ = await choose(ctx, GroupsPlan, text, [describe(table)])
    _check_roles(table, [(plan.value, "value", ("number",)), (plan.groups, "groups", GROUPING)])
    ctx.progress(f"Comparing groups in {table.name}")
    found = await WORKERS.run(ctx, compare, table.frame, plan.value, plan.groups, plan.reference)
    others = found.table.iloc[1:]
    top = others.iloc[0]
    ctx.write(
        _table_note(tables)
        + f"Compared `{plan.value}` between {len(found.table)} groups of `{plan.groups}`, each "
        + f"against `{found.reference}`. The largest difference is `{top['Group']}`'s, "
        + f"{top['Difference']:+.3g} (95% interval {top['Low']:.3g} to {top['High']:.3g}, "
        + f"p = {top['p-value']:.2g})."
        + (
            " Left out for having fewer than two values: "
            + ", ".join(f"`{g}`" for g in found.left_out)
            + "."
            if found.left_out
            else ""
        )
        + f" {ASSOCIATION}\n\n"
    )
    await show_frame(
        ctx,
        found.table,
        f"{plan.value} by {plan.groups}",
        results_name=f"{table.stem}-group-comparison.csv",
    )
    source = table.name if table.source_id else None
    differences = _estimates(others["Group"], others["Difference"], others["Low"], others["High"])
    title = f"Difference in {plan.value} from {found.reference}"
    await _draw(ctx, differences, _estimates_chart(title), source, table.source_id)
    box = ChartChoice.model_validate(
        {
            "template": "box",
            "title": f"{plan.value} by {plan.groups}",
            "category": plan.groups,
            "value": plan.value,
        }
    )
    await _draw(ctx, table.frame, box, source, table.source_id)


MAX_VIF = 5


async def find_drivers(ctx: CallContext, text: str) -> None:
    tables = await read_tables(ctx, text)
    table = tables[0]
    plan, _ = await choose(ctx, DriversPlan, text, [describe(table)])
    drivers = [d for d in dict.fromkeys(plan.drivers) if d != plan.outcome]
    if not drivers:
        raise TraitError("no_drivers", "Name at least one column that might go with the outcome.")
    roles = [(plan.outcome, "outcome", ("number",))]
    roles += [(d, "drivers", ("number", "text", "boolean")) for d in drivers]
    _check_roles(table, roles)
    ctx.progress(f"Fitting {plan.outcome} in {table.name}")
    found = await WORKERS.run(ctx, regress, table.frame, plan.outcome, drivers)
    terms = found.terms
    clear = terms[(terms["Low"] > 0) | (terms["High"] < 0)]
    tangled = {
        term.split(" = ")[0]: vif for term, vif in zip(terms["Term"], terms["VIF"]) if vif > MAX_VIF
    }
    ctx.write(
        _table_note(tables)
        + f"Regressed `{plan.outcome}` on {_listed([f'`{d}`' for d in drivers])} over "
        + f"{found.rows:,} rows (R² = {found.r_squared:.2f})."
        + (f" {found.left_out:,} rows missing a value were left out." if found.left_out else "")
        + (
            " Terms whose 95% interval excludes zero: "
            + _listed([f"`{t}` ({c:+.3g})" for t, c in zip(clear["Term"], clear["Coefficient"])])
            + "."
            if len(clear)
            else " No term's 95% interval excludes zero."
        )
        + (
            " Hard to tell apart (VIF above 5): "
            + _listed([f"`{driver}` ({vif:.0f})" for driver, vif in tangled.items()])
            + "."
            if tangled
            else ""
        )
        + f" {ASSOCIATION}\n\n"
    )
    await show_frame(
        ctx, terms, f"Drivers of {plan.outcome}", results_name=f"{table.stem}-drivers.csv"
    )
    coefficients = _estimates(terms["Term"], terms["Coefficient"], terms["Low"], terms["High"])
    title = f"Coefficients for {plan.outcome}"
    source = table.name if table.source_id else None
    await _draw(ctx, coefficients, _estimates_chart(title), source, table.source_id)


HELD_PERCENT = 10


async def check_confounders(ctx: CallContext, text: str) -> None:
    tables = await read_tables(ctx, text)
    table = tables[0]
    plan, _ = await choose(ctx, ConfoundersPlan, text, [describe(table)])
    controls = [c for c in dict.fromkeys(plan.controls) if c not in (plan.outcome, plan.focus)]
    roles = [(plan.outcome, "outcome", ("number",)), (plan.focus, "focus", ("number", "boolean"))]
    roles += [(c, "controls", ("number", "text", "boolean")) for c in controls]
    if plan.subgroups:
        roles.append((plan.subgroups, "subgroups", GROUPING))
    _check_roles(table, roles)
    ctx.progress(f"Checking {plan.focus} in {table.name}")
    found = await WORKERS.run(
        ctx, check, table.frame, plan.outcome, plan.focus, controls, plan.subgroups
    )
    alone = f"{found.alone:+.3g}"
    ctx.write(
        _table_note(tables)
        + f"Alone, `{plan.focus}` goes with a change of {alone} in `{plan.outcome}` per unit. "
        + (_verdict(found.alone, found.adjusted, controls) if found.adjusted is not None else "")
        + f"{ASSOCIATION}\n\n"
    )
    estimates = found.estimates
    await show_frame(
        ctx,
        estimates,
        f"{plan.focus} and {plan.outcome}",
        results_name=f"{table.stem}-confounders.csv",
    )
    chart = _estimates(
        estimates["Estimate"], estimates["Coefficient"], estimates["Low"], estimates["High"]
    )
    title = f"Estimates for {plan.focus}"
    source = table.name if table.source_id else None
    await _draw(ctx, chart, _estimates_chart(title), source, table.source_id)


def _verdict(alone: float, adjusted: float, controls: list[str]) -> str:
    change = (adjusted - alone) / abs(alone) * 100 if alone else 0.0
    if alone and adjusted and (alone > 0) != (adjusted > 0):
        held = "changed sign"
    elif abs(change) < HELD_PERCENT:
        held = "held"
    elif abs(adjusted) < abs(alone):
        held = f"shrank by {abs(change):.0f}%"
    else:
        held = f"grew by {abs(change):.0f}%"
    with_ = _listed([f"`{c}`" for c in controls])
    return f"With {with_} accounted for, it is {adjusted:+.3g}: the estimate {held}. "


def _check_roles(table: Table, roles: list[tuple[str, str, tuple[str, ...]]]) -> None:
    for column, role, kinds in roles:
        if reason := role_problem(table.frame, column, role, kinds):
            raise TraitError("column_role", reason)


def _estimates(
    labels: pd.Series, estimates: pd.Series, low: pd.Series, high: pd.Series
) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "term": labels.to_numpy(),
            "estimate": estimates.to_numpy(),
            "estimate_low": low.to_numpy(),
            "estimate_high": high.to_numpy(),
        }
    )


def _estimates_chart(title: str) -> ChartChoice:
    return ChartChoice.model_validate(
        {"template": "estimates", "title": title, "category": "term", "value": "estimate"}
    )


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
