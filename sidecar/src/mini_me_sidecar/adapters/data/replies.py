"""How each data Trait answers: read the tables, let the model choose from a catalogue when
the Trait needs it, compute with the tools, and reply with text, `table` components and
saved files."""

import asyncio

import pandas as pd
from pydantic import BaseModel

from mini_me_sidecar.adapters.data.catalogue import (
    CheckPlan,
    CleanPlan,
    JoinPlan,
    describe_entry,
    problem,
)
from mini_me_sidecar.adapters.data.choose import choose
from mini_me_sidecar.adapters.data.clean import apply_actions, log_frame
from mini_me_sidecar.adapters.data.describe import describe, shared_line
from mini_me_sidecar.adapters.data.join import join, shared_key
from mini_me_sidecar.adapters.data.preview import table_data, table_text
from mini_me_sidecar.adapters.data.profile import profile as profile_frame
from mini_me_sidecar.adapters.data.profile import summary
from mini_me_sidecar.adapters.data.tables import Table, read_tables, table_file
from mini_me_sidecar.adapters.data.validate import results_frame, run_checks
from mini_me_sidecar.context import CallContext, TraitError

# The core's limit for a file written by a Trait.
MAX_WRITE_BYTES = 32 * 1024 * 1024


async def profile(ctx: CallContext, text: str) -> None:
    tables = await read_tables(ctx, text)
    for table in tables:
        ctx.progress(f"Profiling {table.name}")
        columns = await asyncio.to_thread(profile_frame, table.frame)
        ctx.write(_sheet_note(table) + summary(table.name, table.frame) + "\n\n")
        await _table(ctx, columns, f"Columns of {table.name}")


async def validate(ctx: CallContext, text: str) -> None:
    tables = await read_tables(ctx, text)
    described = [describe(t) for t in tables]
    plan = await choose(ctx, CheckPlan, text, [d for d, _ in described])
    usable = {id(c) for t in tables for c in plan.checks if not problem(c, _columns(t))}
    ignored = [c for c in plan.checks if id(c) not in usable]
    for table in tables:
        ctx.progress(f"Checking {table.name}")
        checks = [c for c in plan.checks if not problem(c, _columns(table))]
        results, report = await asyncio.to_thread(run_checks, table.frame, table.name, checks)
        failed = sum(r.result != "Passed" for r in results)
        ctx.write(
            _sheet_note(table)
            + f"Ran {len(results)} checks on `{table.name}`: "
            + (f"{failed} failed." if failed else "all passed.")
            + "\n\n"
        )
        await _table(ctx, results_frame(results), f"Checks on {table.name}")
        await ctx.write_asset(f"{table.stem}-validation.html", "text/html", report.encode())
    _write_ignored(ctx, [(describe_entry(c), _why(c, tables)) for c in ignored])
    ctx.write(shared_line(sorted({n for _, listed in described for n in listed})))


async def clean(ctx: CallContext, text: str) -> None:
    table = (await read_tables(ctx, text))[0]
    description, listed = describe(table)
    plan = await choose(ctx, CleanPlan, text, [description])
    ctx.progress(f"Cleaning {table.name}")
    cleaned, log = await asyncio.to_thread(apply_actions, table.frame, plan.actions)
    applied = [a for a in log if not a.note]
    ctx.write(
        _sheet_note(table)
        + f"Applied {len(applied)} of {len(log)} actions to `{table.name}`. "
        + f"The result has {len(cleaned):,} rows and {cleaned.shape[1]:,} columns.\n\n"
    )
    for entry in log:
        if entry.note:
            ctx.write(f"- {entry.action}: {entry.note}\n")
    source = await _save(ctx, table, cleaned, "cleaned")
    await _table(ctx, log_frame(log), "Cleaning actions")
    await _table(ctx, cleaned, f"Cleaned {table.name}", source)
    ctx.write("\n" + shared_line(listed))


async def join_tables(ctx: CallContext, text: str) -> None:
    tables = await read_tables(ctx, text)
    if len(tables) < 2:
        raise TraitError("two_tables", "Reference or attach two tables to join.")
    left, right = tables[0], tables[1]
    if ctx.model is not None and ctx.model.model:
        descriptions = [describe(left, values=False)[0], describe(right, values=False)[0]]
        plan = await choose(ctx, JoinPlan, text, descriptions)
    elif (plan := shared_key(left.frame, right.frame)) is None:
        raise TraitError(
            "model_not_set",
            "Choose an AI model in Settings first: the tables don't share exactly one "
            "column to join on.",
        )
    ctx.progress(f"Joining {left.name} and {right.name}")
    result, stats = await asyncio.to_thread(join, left.frame, right.frame, plan, right.stem)
    keys = ", ".join(f"`{k}`" for k in plan.left_on)
    ctx.write(
        f"Joined `{left.name}` ({stats.left_rows:,} rows) with `{right.name}` "
        f"({stats.right_rows:,} rows) on {keys}, as a {plan.how} join: "
        f"{stats.rows:,} rows.\n\n"
        f"- Keys in `{left.name}` without a match: {stats.left_unmatched:,}\n"
        f"- Keys in `{right.name}` without a match: {stats.right_unmatched:,}\n"
    )
    source = await _save(ctx, left, result, "joined", csv_only=True)
    await _table(ctx, result, f"{left.stem} joined with {right.stem}", source)


async def _table(
    ctx: CallContext, frame: pd.DataFrame, title: str, source: str | None = None
) -> None:
    data = table_data(frame, title=title, source=source)
    await ctx.component("table", 1, data, table_text(data))


async def _save(
    ctx: CallContext, table: Table, frame: pd.DataFrame, suffix: str, csv_only: bool = False
) -> str | None:
    """Saves `frame` as a new Asset and returns its name, or None when it is too large."""
    name, media, data = await asyncio.to_thread(table_file, table, frame, suffix, csv_only)
    if len(data) > MAX_WRITE_BYTES:
        ctx.write(f"\nThe result is larger than 32 MiB, so `{name}` could not be saved.\n")
        return None
    await ctx.write_asset(name, media, data)
    return name


def _sheet_note(table: Table) -> str:
    if table.sheet is None:
        return ""
    others = [s for s in table.sheets if s != table.sheet]
    note = f'Read the sheet "{table.sheet}" of `{table.name}`'
    if others:
        note += " (it also has " + ", ".join(f'"{s}"' for s in others) + ")"
    return note + ". "


def _write_ignored(ctx: CallContext, ignored: list[tuple[str, str]]) -> None:
    if ignored:
        ctx.write("Not run, because the AI model's choice didn't fit the data:\n")
        for label, reason in ignored:
            ctx.write(f"- {label}: {reason}\n")
        ctx.write("\n")


def _why(entry: BaseModel, tables: list[Table]) -> str:
    return problem(entry, _columns(tables[0])) or "it fits none of the tables"


def _columns(table: Table) -> list[str]:
    return [str(c) for c in table.frame.columns]
