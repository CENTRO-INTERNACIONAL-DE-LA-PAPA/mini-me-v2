import { Button } from "@/components/ui/button";
import { useState } from "react";
import { api, errorMessage } from "../../api";
import type { RendererProps, Renderers } from "./catalogue";

/** Version 1 data: the approval Step and what it asks. */
interface ApprovalData {
  step_id?: string;
  prompt?: string;
}

/** Whether an approval asks, or what it was answered; `closed` when its reply ended first. A
 * reply shows the component only while it asks. */
export function approvalState(
  answer: unknown,
  replyStatus: RendererProps["replyStatus"],
): "approved" | "rejected" | "asking" | "closed" {
  if (answer && typeof answer === "object" && "approved" in answer) {
    return answer.approved === true ? "approved" : "rejected";
  }
  return replyStatus === "paused" ? "asking" : "closed";
}

/** A Workflow's approval Step while the reply waits: its prompt, with Approve and Reject.
 * Draws nothing once answered or once the reply ended. */
function Approval({ data, answer, projectId, messageId, componentId, replyStatus }: RendererProps) {
  const { prompt } = (data ?? {}) as ApprovalData;
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (approvalState(answer, replyStatus) !== "asking") return null;

  async function respond(approved: boolean) {
    if (!projectId || !messageId || !componentId) return;
    setSending(true);
    setError(null);
    try {
      await api.answerApproval(projectId, messageId, componentId, approved);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-card-edge bg-card px-4 py-3">
      <p className="text-ui text-foreground">{prompt}</p>
      <div className="flex gap-2">
        <Button onClick={() => respond(true)} disabled={sending}>
          Approve
        </Button>
        <Button variant="outline" onClick={() => respond(false)} disabled={sending}>
          Reject
        </Button>
      </div>
      {error && <p className="text-meta text-destructive">{error}</p>}
    </div>
  );
}

export const renderers: Renderers = { 1: Approval };
