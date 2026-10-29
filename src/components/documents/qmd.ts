import { parseDocument } from "yaml";

const HEADER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** A field of the document's YAML header as text, or "" when it is missing, not text, or the
 * header cannot be read; a list of authors is joined with commas. */
export function headerField(text: string, key: "title" | "author"): string {
  const match = HEADER.exec(text);
  if (!match) return "";
  const header = parseDocument(match[1]);
  if (header.errors.length > 0) return "";
  const value = header.toJS()?.[key];
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string").join(", ");
  return "";
}

/** A heading of the document, with the line it is on (1-based). */
export interface Heading {
  level: number;
  text: string;
  line: number;
}

/** The document's `#` headings in order, outside its YAML header and code blocks. */
export function headings(text: string): Heading[] {
  const lines = text.split(/\r?\n/);
  const found: Heading[] = [];
  let start = 0;
  const header = HEADER.exec(text);
  if (header) start = header[0].split("\n").length - 1;
  let fence: string | null = null;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const code = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence !== null) {
      if (code && code[1][0] === fence[0] && code[1].length >= fence.length) fence = null;
      continue;
    }
    if (code) {
      fence = code[1];
      continue;
    }
    // A closing run of # counts only after a space, as in CommonMark: "## C#" keeps its #.
    const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(line);
    if (heading) found.push({ level: heading[1].length, text: heading[2], line: i + 1 });
  }
  return found;
}
