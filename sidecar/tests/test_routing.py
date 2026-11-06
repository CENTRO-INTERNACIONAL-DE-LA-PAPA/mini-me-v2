import asyncio

import pytest

from mini_me_sidecar.adapters.data.replies import read_tables
from mini_me_sidecar.context import TraitError
from mini_me_sidecar.routing import _questions


def test_the_file_question_offers_each_file_and_none():
    components = [
        {"kind": "chart", "title": "Yield by variety"},
        {"kind": "table", "title": "Field trial"},
        {"kind": "chart", "title": None},
    ]
    files = [
        {"id": "a1", "name": "trial.csv", "components": []},
        {"id": "a2", "name": "field-trial.csv", "components": components},
    ]
    question = _questions(["file"], [], files)["file"]
    assert question.criteria == {
        "a1": "The file trial.csv",
        "a2": "The file field-trial.csv. Used by components: chart 'Yield by variety', "
        "table 'Field trial', chart",
        "none": "The message is not about one of these files",
    }


class FakeContext:
    message: dict = {"text_components": [], "attachments": []}
    file = {"asset_id": "a1", "name": "trial.csv"}

    async def results(self) -> dict:
        return {"assets": [{"id": "a1", "name": "trial.csv"}], "components": []}


def test_join_data_gets_no_fallback_table():
    with pytest.raises(TraitError) as raised:
        asyncio.run(read_tables(FakeContext(), "join the tables", fallback=False))
    assert raised.value.code == "no_table"
