import pytest


class SentFrames:
    """A link that keeps every frame sent to the core."""

    def __init__(self) -> None:
        self.sent: list[dict] = []

    def send(self, frame: dict) -> None:
        self.sent.append(frame)


@pytest.fixture
def link() -> SentFrames:
    return SentFrames()
