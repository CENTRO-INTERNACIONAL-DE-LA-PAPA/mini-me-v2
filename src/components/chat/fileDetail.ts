import { formatRelative } from "../../lib/format";
import type { FileEntry, MiniMe } from "../../protocol/types";

/** When a file was added and by whom, shown under it in the `#` list: "Added 2 h ago", or
 * "Saved by Curator 2 h ago" for a Mini-Me's output. */
export function fileDetail(file: FileEntry, miniMes: MiniMe[], now: number = Date.now()): string {
  const when = formatRelative(file.created_at, now);
  const by = file.added_by;
  if (by?.kind === "mini_me") {
    const name = miniMes.find((m) => m.id === by.id)?.name;
    if (name) return `Saved by ${name} ${when}`;
  }
  return `Added ${when}`;
}
