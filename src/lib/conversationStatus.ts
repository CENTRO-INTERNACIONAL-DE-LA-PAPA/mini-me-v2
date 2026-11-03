import type { ConversationStatus } from "../protocol/types";

/** The words under a Conversation's title while its latest reply is running or waits. */
export function statusLabel(status: ConversationStatus): string {
  return status.kind === "running" ? "Running" : "Needs your approval";
}
