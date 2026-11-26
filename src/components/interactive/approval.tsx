import { ComponentCard } from "./ComponentCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { api, errorMessage } from "../../api";
import type { ApprovalAnswer } from "../../protocol/types";
import type { RendererProps, Renderers } from "./catalogue";
import { ErrorText } from "../shell/ErrorText";

/** Version 1 preview: the approval Step, what it asks, and `answer` "text" for a written answer. */
interface ApprovalData {
  step_id?: string;
  prompt?: string;
  answer?: "text";
}

/** Whether an approval asks, or what it was answered; `closed` when its reply ended first. */
export function approvalState(
  answer: unknown,
  replyStatus: RendererProps["replyStatus"],
): "approved" | "rejected" | "answered" | "skipped" | "asking" | "closed" {
  if (answer && typeof answer === "object") {
    if ("approved" in answer) return answer.approved === true ? "approved" : "rejected";
    if ("text" in answer) return "answered";
    if ("skipped" in answer) return "skipped";
  }
  return replyStatus === "paused" ? "asking" : "closed";
}

/** A Workflow's approval Step with Approve and Reject, or a text box with Send and Skip; draws
 * nothing unless it is asking. */
function Approval({ preview, answer, projectId, messageId, componentId, replyStatus }: RendererProps) {
  const { prompt, answer: kind } = (preview ?? {}) as ApprovalData;
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (approvalState(answer, replyStatus) !== "asking") return null;

  async function respond(reply: ApprovalAnswer) {
    if (!projectId || !messageId || !componentId) return;
    setSending(true);
    setError(null);
    try {
      await api.answerApproval(projectId, messageId, componentId, reply);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  const blank = text.trim() === "";
  return (
    <ComponentCard className="gap-3">
      <p className="text-ui whitespace-pre-wrap text-foreground">{prompt}</p>
      {kind === "text" ? (
        <>
          <Textarea
            aria-label="Your answer"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !blank && !sending) {
                e.preventDefault();
                void respond({ text });
              }
            }}
          />
          <div className="flex gap-2">
            <Button onClick={() => respond({ text })} disabled={sending || blank}>
              Send
            </Button>
            <Button
              variant="secondary"
              onClick={() => respond({ skipped: true })}
              disabled={sending}
            >
              Skip
            </Button>
          </div>
        </>
      ) : (
        <div className="flex gap-2">
          <Button onClick={() => respond({ approved: true })} disabled={sending}>
            Approve
          </Button>
          <Button
            variant="secondary"
            onClick={() => respond({ approved: false })}
            disabled={sending}
          >
            Reject
          </Button>
        </div>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </ComponentCard>
  );
}

export const renderers: Renderers = { 1: Approval };
