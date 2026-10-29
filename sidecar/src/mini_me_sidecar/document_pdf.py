"""PDF export and preview of documents: a Quarto Markdown document is converted to Typst and
compiled to PDF, or to one SVG image per page for the preview, in memory. Every piece of the document's text reaches Typst as a string literal inside a
function call, never as markup, so nothing a document says can change the layout or run
Typst code. Code cells are printed, never run."""

import re
from datetime import date
from typing import Any

import typst
import yaml
from markdown_it import MarkdownIt
from markdown_it.tree import SyntaxTreeNode

_HEADER = re.compile(r"\A---[ \t]*\n(.*?)\n---[ \t]*(?:\n|\Z)", re.DOTALL)
# Quarto's fenced divs (`::: {.callout-note}` … `:::`) and shortcodes (`{{< pagebreak >}}`):
# their markers are dropped and the text inside them stays as ordinary paragraphs.
_DIV_FENCE = re.compile(r"^ {0,3}:{3,}.*$", re.MULTILINE)
_SHORTCODE = re.compile(r"\{\{<.*?>\}\}")

_PARSER = MarkdownIt("commonmark").enable("table")

_PREAMBLE = """#set page(paper: "a4", margin: 2.5cm)
#set text(size: 11pt)
#set par(justify: true)
#show heading: set block(above: 1.4em, below: 0.8em)
"""


def split_header(source: str) -> tuple[dict[str, Any], str]:
    """The document's YAML header as a dict (empty when it has none or it is not a mapping),
    and its body."""
    match = _HEADER.match(source)
    if not match:
        return {}, source
    try:
        header = yaml.safe_load(match.group(1))
    except yaml.YAMLError:
        header = None
    return (header if isinstance(header, dict) else {}), source[match.end() :]


def string(text: str) -> str:
    """`text` as a Typst string literal."""
    escaped = text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return f'"{escaped}"'


def _text(text: str) -> str:
    return f"#{string(text)}" if text else ""


def _inline(node: SyntaxTreeNode) -> str:
    """Typst content for an inline node and its children."""
    match node.type:
        case "text":
            return _text(node.content)
        case "softbreak":
            return " "
        case "hardbreak":
            return "#linebreak()"
        case "code_inline":
            return f"#raw({string(node.content)})"
        case "strong":
            return f"#strong[{_children(node)}]"
        case "em":
            return f"#emph[{_children(node)}]"
        case "link":
            href = str(node.attrs.get("href", ""))
            return f"#link({string(href)})[{_children(node)}]"
        case "image":
            # Images live outside the document; their description is printed instead.
            return _text(node.content or str(node.attrs.get("alt", "")))
        case "html_inline":
            return _text(node.content)
        case _:
            return _children(node)


def _children(node: SyntaxTreeNode) -> str:
    return "".join(_inline(child) for child in node.children)


def _block(node: SyntaxTreeNode) -> str:
    """Typst for a block node, ending with a blank line."""
    match node.type:
        case "heading":
            level = int(node.tag[1:])
            return f"#heading(level: {level})[{_children(node.children[0])}]\n\n"
        case "paragraph":
            return f"{_children(node.children[0])}\n\n"
        case "blockquote":
            return f"#quote(block: true)[\n{_blocks(node)}]\n\n"
        case "bullet_list" | "ordered_list":
            function = "list" if node.type == "bullet_list" else "enum"
            items = ", ".join(f"[{_blocks(item).strip()}]" for item in node.children)
            return f"#{function}({items})\n\n"
        case "fence" | "code_block":
            # A code cell's info string is `{python}`; its language is printed without braces.
            language = (node.info or "").strip().strip("{}").split(" ")[0].split(",")[0]
            lang = f"lang: {string(language)}, " if language else ""
            return f"#raw(block: true, {lang}{string(node.content.rstrip(chr(10)))})\n\n"
        case "table":
            return _table(node)
        case "hr":
            return "#line(length: 100%)\n\n"
        case "html_block":
            return f"{_text(node.content.strip())}\n\n"
        case _:
            return _blocks(node)


def _blocks(node: SyntaxTreeNode) -> str:
    return "".join(_block(child) for child in node.children)


def _table(node: SyntaxTreeNode) -> str:
    rows = [row for section in node.children for row in section.children]
    if not rows:
        return ""
    columns = max(len(row.children) for row in rows)
    cells: list[str] = []
    for index, row in enumerate(rows):
        for cell in row.children:
            content = _children(cell.children[0]) if cell.children else ""
            cells.append(f"[#strong[{content}]]" if index == 0 else f"[{content}]")
        cells.extend("[]" for _ in range(columns - len(row.children)))
    return f"#table(columns: {columns}, {', '.join(cells)})\n\n"


def typst_source(source: str) -> str:
    """The whole document as Typst: page settings, the title and author from its header, and
    its body."""
    # A file saved on Windows has CRLF line endings, which the header pattern does not match.
    header, body = split_header(source.replace("\r\n", "\n"))
    body = _SHORTCODE.sub("", _DIV_FENCE.sub("", body))
    title = _scalar(header.get("title"))
    author = header.get("author")
    authors = author if isinstance(author, list) else [author] if author else []
    names = ", ".join(name for name in map(_person, authors) if name)
    lines = [_PREAMBLE]
    if title:
        lines.append(f"#set document(title: {string(title)})\n")
        lines.append(
            f"#align(center, text(size: 20pt, weight: \"bold\", {string(title)}))\n"
        )
    if names:
        lines.append(f"#align(center, text(size: 12pt, {string(names)}))\n")
    if len(lines) > 1:
        lines.append("#v(1.5em)\n")
    lines.append(_blocks(SyntaxTreeNode(_PARSER.parse(body))))
    return "".join(lines)


def _scalar(value: Any) -> str:
    """A header value YAML read as text, a number or a date, as text; "" for anything else."""
    if isinstance(value, bool) or not isinstance(value, (str, int, float, date)):
        return ""
    return str(value).strip()


def _person(value: Any) -> str:
    """An author's name: Quarto writes one as text, as `{name: …}`, or with the name split
    into `{given: …, family: …}` or given whole as `literal`."""
    if isinstance(value, dict):
        name = value.get("name")
        if isinstance(name, dict):
            literal = _scalar(name.get("literal"))
            parts = (_scalar(name.get("given")), _scalar(name.get("family")))
            return literal or " ".join(part for part in parts if part)
        return _scalar(name)
    return _scalar(value)


def export_pdf(source: str) -> bytes:
    """The document `source` as PDF bytes."""
    return typst.compile(typst_source(source).encode("utf-8"), format="pdf")


def preview_pages(source: str) -> list[str]:
    """The document `source` as it exports, one SVG image per page."""
    pages = typst.compile(typst_source(source).encode("utf-8"), format="svg")
    return [page.decode("utf-8") for page in (pages if isinstance(pages, list) else [pages])]
