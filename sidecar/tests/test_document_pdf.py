import os

import pytest

from mini_me_sidecar.document_pdf import _PREAMBLE, export_pdf, split_header, string, typst_source


def body(source: str) -> str:
    """The Typst for the body of a document without a header: everything after the preamble."""
    typst = typst_source(source)
    assert typst.startswith(_PREAMBLE)
    return typst[len(_PREAMBLE) :]


def test_the_header_gives_title_and_author_and_is_split_off():
    header, rest = split_header('---\ntitle: "Report"\nauthor: Ana\nformat: pdf\n---\n\n# A\n')
    assert header == {"title": "Report", "author": "Ana", "format": "pdf"}
    assert rest == "\n# A\n"
    assert split_header("# No header\n") == ({}, "# No header\n")
    assert split_header("---\n- not\n- a mapping\n---\nText") == ({}, "Text")


def test_strings_are_escaped_for_typst():
    assert string('a "b" \\ c\nd') == '"a \\"b\\" \\\\ c\\nd"'


@pytest.mark.parametrize(
    "markdown, typst",
    [
        ("## Data", '#heading(level: 2)[#"Data"]'),
        ("**212** and *few*", '#strong[#"212"]#" and "#emph[#"few"]'),
        ("Run `pandas`", '#"Run "#raw("pandas")'),
        ("[CIP](https://cipotato.org)", '#link("https://cipotato.org")[#"CIP"]'),
        ("- a\n- b", '#list([#"a"], [#"b"])'),
        ("1. a\n2. b", '#enum([#"a"], [#"b"])'),
        ("> said", '#quote(block: true)[\n#"said"'),
    ],
)
def test_each_block_becomes_typst(markdown, typst):
    assert typst in body(markdown)


def test_markup_characters_stay_text():
    out = body("Costs $5, see #tag @me [1] // and /* this */ = not a heading")
    assert out.strip() == '#"Costs $5, see #tag @me [1] // and /* this */ = not a heading"'


def test_a_code_cell_is_printed_with_its_language():
    out = body('```{python}\nimport os\nos.remove("x")\n```')
    assert out.strip() == '#raw(block: true, lang: "python", "import os\\nos.remove(\\"x\\")")'


def test_a_table_has_a_bold_header_and_full_rows():
    out = body("| Variety | Yield |\n|---|---|\n| Yungay | 22.5 |\n| Canchan |")
    assert out.strip() == (
        '#table(columns: 2, [#strong[#"Variety"]], [#strong[#"Yield"]], '
        '[#"Yungay"], [#"22.5"], [#"Canchan"], [])'
    )


def test_quarto_blocks_keep_their_text_as_paragraphs():
    out = body("::: {.callout-note}\nScanned.\n:::\n\n{{< pagebreak >}}")
    assert out.strip() == '#"Scanned."'


def test_the_title_and_author_open_the_document():
    typst = typst_source('---\ntitle: "R #1"\nauthor: [Ana, Luis]\n---\n')
    assert '#set document(title: "R #1")' in typst
    assert '"Ana, Luis"' in typst


def test_quarto_authors_numbers_and_windows_line_endings_are_read():
    source = (
        "---\r\ntitle: 2025\r\nauthor:\r\n  - name: Ana Pérez\r\n    affiliation: CIP\r\n"
        "  - name: {given: Luis, family: Quispe}\r\n---\r\n\r\n# Yield\r\n"
    )
    typst = typst_source(source)
    assert '#set document(title: "2025")' in typst
    assert '"Ana Pérez, Luis Quispe"' in typst
    assert "title: 2025" not in typst and "affiliation" not in typst


def test_a_document_exports_to_pdf_without_running_code(tmp_path):
    marker = tmp_path / "ran"
    source = (
        '---\ntitle: "Huancayo 2025"\n---\n\n# Summary\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n'
        f'```{{python}}\nopen("{marker}", "w").write("x")\n```\n'
    )
    pdf = export_pdf(source)
    assert pdf.startswith(b"%PDF")
    assert not os.path.exists(marker)
