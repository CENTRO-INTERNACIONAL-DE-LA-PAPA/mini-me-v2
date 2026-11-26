import pytest

from mini_me_sidecar.tools.documents import file_name


@pytest.mark.parametrize(
    "title, name",
    [
        ("Huancayo 2025 report", "Huancayo 2025 report.qmd"),
        ("Trials: 2026/27", "Trials- 2026-27.qmd"),
        ("CON", "CON_.qmd"),
        ("  ...  ", "Document.qmd"),
    ],
)
def test_a_title_becomes_a_safe_file_name(title, name):
    assert file_name(title) == name
