import type {
  DebugMessage,
  ModelCallRecord,
  ReplyRecord,
  ToolCallRecord,
} from "../../protocol/types";

/** One model call as the "[DEBUG] AI" block shows it: its record, its whole input rebuilt from
 * the calls it continues (null when the input was not stored), and the tools it asked for. */
interface ModelCallView {
  call: ModelCallRecord;
  input: DebugMessage[] | null;
  tools: ToolCallRecord[];
}

/** Groups a reply's records, in order, into its model calls. A tool call whose model call is
 * not among them goes with the model call before it. */
export function modelCalls(records: ReplyRecord[]): ModelCallView[] {
  const views: ModelCallView[] = [];
  const byId = new Map<string, ModelCallView>();
  for (const record of records) {
    if (record.type === "model_call") {
      const view = { call: record, input: wholeInput(record, byId), tools: [] };
      views.push(view);
      byId.set(record.id, view);
    } else if (record.type === "tool_call") {
      const view = (record.call && byId.get(record.call)) || views[views.length - 1];
      view?.tools.push(record);
    }
  }
  return views;
}

function wholeInput(
  call: ModelCallRecord,
  earlier: Map<string, ModelCallView>,
): DebugMessage[] | null {
  if (!call.messages) return null;
  const before = call.continues ? earlier.get(call.continues)?.input : null;
  return before ? [...before, ...call.messages] : call.messages;
}
