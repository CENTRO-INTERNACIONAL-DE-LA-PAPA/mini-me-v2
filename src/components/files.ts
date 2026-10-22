/** The groups the Files screen's tabs filter by. */
export type FileKind = "data" | "document" | "image" | "other";

const DATA = /\.(csv|tsv|xlsx?|json|parquet|feather|sav|dta|rds)$/i;
const DOCUMENT = /\.(pdf|docx?|odt|rtf|md|txt|pptx?)$/i;

/** What kind of file an Asset is, from its media type, or its name when the type is generic. */
export function fileKind(mediaType: string, name: string): FileKind {
  if (mediaType.startsWith("image/")) return "image";
  if (DATA.test(name) || /csv|spreadsheet|excel|json|parquet/.test(mediaType)) return "data";
  if (DOCUMENT.test(name) || /pdf|word|markdown|text\/plain|presentation/.test(mediaType)) {
    return "document";
  }
  return "other";
}
