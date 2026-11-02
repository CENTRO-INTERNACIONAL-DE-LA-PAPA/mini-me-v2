from mini_me_sidecar.adapters.prompt import RESEARCH_CONTEXT
from mini_me_sidecar.summary import MAX_TITLE_CHARS, Summarizer, clean_title, system_prompt


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


def test_the_title_prompt_asks_for_a_brief_label_that_is_not_a_copy():
    prompt = system_prompt("title")
    assert prompt.startswith(RESEARCH_CONTEXT)
    assert "brief title" in prompt and "not a sentence" in prompt and "no quotes" in prompt
    assert "do not copy the message" in prompt
    assert "2 or 3 short sentences" not in prompt


def test_a_title_is_the_first_line_without_quotes_or_a_full_stop():
    assert clean_title('"Yield by altitude."\n\nBecause it matters') == "Yield by altitude"
    assert clean_title("  **Late blight trial**  ") == "Late blight trial"
    assert clean_title("   \n  ") == ""
    long = "Breaking the chicken-or-egg riddle into research questions on evolution, definitions"
    cut = clean_title(long)
    assert len(cut) <= MAX_TITLE_CHARS and long.startswith(cut)
    assert cut == "Breaking the chicken-or-egg riddle into research questions"
    assert long[len(cut)] == " "  # cut after a whole word
    assert clean_title("Short title") == "Short title"
    assert len(clean_title("x" * 100)) == MAX_TITLE_CHARS
