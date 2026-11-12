import asyncio


from mini_me_sidecar.context import CoreRequestError
from mini_me_sidecar.routing import NEEDS_CONTEXT, Router, _asked, _questions


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


def test_asked_holds_the_state_and_each_question_as_sent():
    files = [{"id": "a1", "name": "trial.csv", "components": []}]
    state = {"message": "check the data", "files": [], "recent": []}
    asked = _asked(state, _questions(["needs_context", "file"], [], files))
    assert asked["state"] == state
    assert asked["questions"]["needs_context"] == {
        "instructions": "Does answering this message need the earlier messages of the "
        "conversation?",
        "options": NEEDS_CONTEXT,
    }
    assert asked["questions"]["file"]["options"]["a1"] == "The file trial.csv"


class NoKey:
    async def send(self, call_id: str, kind: str, payload: dict) -> dict:
        raise CoreRequestError("key_missing", "No Typesafe key is saved.")


def test_a_request_that_was_not_sent_has_nothing_asked(link):
    router = Router(link, NoKey())
    asyncio.run(router._route("r1", {"state": {}, "ask": ["reaction"]}))
    assert link.sent == [
        {
            "type": "route.error",
            "route_id": "r1",
            "error": {"code": "key_missing", "message": "No Typesafe key is saved."},
            "asked": None,
        }
    ]
