import type { QuartoStatus } from "../../protocol/types";

/** Whether document work is blocked. Not while Quarto has yet to be looked up, so a document
 * does not flash a notice as it opens. */
export function documentsBlocked(status: QuartoStatus | null): boolean {
  return status !== null && status.state !== "found";
}

/** What the notice says about a Quarto that cannot be used. */
export function quartoNotice(status: QuartoStatus): string {
  switch (status.state) {
    case "missing":
      return "Quarto is needed to edit documents in Mini-Me. Install it, then check again.";
    case "too_old":
      return `Quarto ${status.version ?? ""} is too old for documents; version ${status.minimum} or later is needed. Install a newer one, then check again.`;
    case "broken":
      return `Quarto could not be run at ${status.path ?? "its location"}. Check its location in Settings.`;
    case "found":
      return "";
  }
}
