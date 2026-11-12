import raw from "../../CHANGELOG.md?raw";

/** The release notes of one version: the version in the first line, `# Mini-Me 0.6.0`, and the
 * Markdown after it. */
interface Changelog {
  /** Null when the first line names no version. */
  version: string | null;
  body: string;
}

/** Splits CHANGELOG.md's text into the version its first line names and the rest. */
export function parseChangelog(text: string): Changelog {
  const [first, ...rest] = text.split(/\r?\n/);
  const version = first.match(/^# Mini-Me (\S+)\s*$/)?.[1] ?? null;
  return version ? { version, body: rest.join("\n").trim() } : { version: null, body: text.trim() };
}

/** The changelog of this build, bundled so it reads without a network connection. */
export const changelog = parseChangelog(raw);
