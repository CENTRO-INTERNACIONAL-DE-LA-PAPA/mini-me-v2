import { Button } from "@/components/ui/button";
import { useState } from "react";
import { api, errorMessage } from "../../api";
import type { DebugMessage, ModelCallRecord, ReplyRecord } from "../../protocol/types";
import { modelCalls } from "./replyDebug";

const json = (value: unknown) =>
  typeof value === "string" ? value : JSON.stringify(value, null, 2);

/** The "[DEBUG] AI" block under a reply: its model and tool calls, read again on each open. */
export function ReplyDebugBlock({
  projectId,
  messageId,
}: {
  projectId: string;
  messageId: string;
}) {
  // `undefined` until the block is first opened.
  const [records, setRecords] = useState<ReplyRecord[] | undefined>(undefined);
  const [note, setNote] = useState<string | null>(null);

  async function load() {
    setNote(null);
    try {
      setRecords(await api.getDebugRecords<ReplyRecord>(projectId, messageId, "reply"));
    } catch (e) {
      setNote(errorMessage(e));
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(records, null, 2));
      setNote("Copied");
    } catch {
      setNote("Could not copy");
    }
  }

  return (
    <details
      className="text-meta text-muted-foreground"
      onToggle={(event) => event.currentTarget.open && load()}
    >
      <summary className="cursor-pointer select-none">[DEBUG] AI</summary>
      {records?.length === 0 && <p className="mt-1">Nothing recorded for this reply</p>}
      {records && records.length > 0 && (
        <div className="mt-1 flex flex-col gap-3">
          {modelCalls(records).map(({ call, input, tools }, index) => (
            <div key={call.id} className="flex flex-col gap-1">
              <p className="text-foreground">
                {index + 1}. {title(call)}
              </p>
              {details(call) && <p>{details(call)}</p>}
              {input && (
                <details>
                  <summary className="cursor-pointer select-none">
                    What the AI read ({input.length} {input.length === 1 ? "message" : "messages"})
                  </summary>
                  <div className="mt-1 ms-3 flex flex-col gap-2">
                    {input.map((message, i) => (
                      <InputMessage key={i} message={message} />
                    ))}
                  </div>
                </details>
              )}
              {tools.map((tool, i) => (
                <div key={i} className="ms-3 flex flex-col gap-1">
                  <p className="text-foreground">Tool: {tool.name}</p>
                  <pre className="font-mono whitespace-pre-wrap wrap-anywhere">
                    {json(tool.args)}
                  </pre>
                  <p>Result</p>
                  <pre className="font-mono whitespace-pre-wrap wrap-anywhere">{tool.result}</pre>
                </div>
              ))}
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="xs" onClick={copy}>
              Copy as JSON
            </Button>
          </div>
        </div>
      )}
      {note && <p className="mt-1">{note}</p>}
    </details>
  );
}

function InputMessage({ message }: { message: DebugMessage }) {
  return (
    <div>
      <p className="text-foreground">
        {message.role}
        {message.tool_call_id && ` (result of ${message.tool_call_id})`}
      </p>
      {message.content !== "" && (
        <pre className="font-mono whitespace-pre-wrap wrap-anywhere">{json(message.content)}</pre>
      )}
      {message.tool_calls?.map((call, i) => (
        <pre key={i} className="font-mono whitespace-pre-wrap wrap-anywhere">
          {`Calls ${call.name}${call.id ? ` (${call.id})` : ""}: ${json(call.args)}`}
        </pre>
      ))}
    </div>
  );
}

/** The call's Step, and its Trait when the Step is named otherwise. */
function title(call: ModelCallRecord): string {
  return call.trait && call.trait !== call.step ? `${call.step} (${call.trait})` : call.step;
}

/** The provider, model, time and tokens, as far as they were stored. */
function details(call: ModelCallRecord): string {
  const parts = [call.provider, call.model];
  if (call.duration_ms !== null) parts.push(`${(call.duration_ms / 1000).toFixed(1)} s`);
  if (call.tokens_in !== null) parts.push(`${call.tokens_in} tokens in`);
  if (call.tokens_out !== null) parts.push(`${call.tokens_out} out`);
  return parts.filter(Boolean).join(", ");
}
