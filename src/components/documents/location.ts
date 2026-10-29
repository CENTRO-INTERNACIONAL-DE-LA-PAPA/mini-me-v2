import { headings } from "./qmd";

const LIST_ITEM = /^ {0,3}(?:[-*+]|\d+[.)])[ \t]/;

/** Where the passage starting at `at` sits in the document: the heading of its section, with
 * ", bullet N" when it starts in the section's Nth list item; null before the first heading. */
export function passageLocation(text: string, at: number): string | null {
  const lines = text.split("\n");
  const lineStarts: number[] = [];
  let start = 0;
  for (const line of lines) {
    lineStarts.push(start);
    start += line.length + 1;
  }
  const lineOf = (offset: number) => lineStarts.filter((s) => s <= offset).length - 1;
  const passageLine = lineOf(at);
  const heading = headings(text)
    .filter((h) => h.line - 1 <= passageLine)
    .pop();
  if (!heading) return null;
  if (!LIST_ITEM.test(lines[passageLine])) return heading.text;
  let bullet = 0;
  for (let line = heading.line; line <= passageLine; line++) {
    if (LIST_ITEM.test(lines[line])) bullet++;
  }
  return `${heading.text}, bullet ${bullet}`;
}
