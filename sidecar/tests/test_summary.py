from mini_me_sidecar.adapters.prompt import RESEARCH_CONTEXT
from mini_me_sidecar.summary import Summarizer, system_prompt


class FakeLink:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    def send(self, frame: dict) -> None:
        self.sent.append(frame)


def test_the_summary_prompt_says_whose_research_it_is_and_how_long_to_write():
    prompt = system_prompt()
    assert prompt.startswith(RESEARCH_CONTEXT)
    assert "2 or 3 short sentences, at most 60" in prompt
    assert "never invent" in prompt


def test_a_summary_request_without_an_id_is_ignored():
    link = FakeLink()
    summarizer = Summarizer(link, requests=None)  # type: ignore[arg-type]
    summarizer.start({"type": "summary.start", "material": "x"})
    assert link.sent == []
