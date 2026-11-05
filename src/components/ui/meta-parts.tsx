import type { ReactNode } from "react";

/** Short details shown one after another, such as a name and a time, kept apart by a gap rather
 * than a separator character. Empty parts are left out. The parts stay inline, so a truncated
 * line still ends in an ellipsis. */
export function MetaParts({ parts }: { parts: ReactNode[] }) {
  const shown = parts.filter((part) => part != null && part !== false && part !== "");
  return shown.map((part, i) => (
    <span key={i} className={i > 0 ? "ms-2" : undefined}>
      {part}
    </span>
  ));
}
