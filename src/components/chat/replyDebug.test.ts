import { describe, expect, it } from "vitest";
import type { ModelCallRecord, ToolCallRecord } from "../../protocol/types";
import { modelCalls } from "./replyDebug";

const call = (id: string, fields: Partial<ModelCallRecord> = {}): ModelCallRecord => ({
  type: "model_call",
  id,
  step: "Assistant",
  trait: "Assistant",
  continues: null,
  messages: null,
  provider: null,
  model: null,
  duration_ms: null,
  tokens_in: null,
  tokens_out: null,
  ...fields,
});

const tool = (callId: string | null, name: string): ToolCallRecord => ({
  type: "tool_call",
  call: callId,
  name,
  args: {},
  result: "{}",
});

describe("modelCalls", () => {
  it("puts each tool call under the model call that asked for it", () => {
    const views = modelCalls([call("a"), tool("a", "read_table"), call("b"), tool(null, "plot")]);
    expect(views.map((v) => [v.call.id, v.tools.map((t) => t.name)])).toEqual([
      ["a", ["read_table"]],
      ["b", ["plot"]],
    ]);
  });

  it("rebuilds a continuing call's whole input from the calls before it", () => {
    const user = { role: "user", content: "Read the table" };
    const asks = { role: "assistant", content: "", tool_calls: [{ name: "read_table", args: {} }] };
    const result = { role: "tool", content: "{}", tool_call_id: "c1" };
    const answer = { role: "assistant", content: "Done" };
    const views = modelCalls([
      call("a", { messages: [user] }),
      call("b", { continues: "a", messages: [asks, result] }),
      call("c", { continues: "b", messages: [answer] }),
      call("d"),
    ]);
    expect(views.map((v) => v.input)).toEqual([
      [user],
      [user, asks, result],
      [user, asks, result, answer],
      null,
    ]);
  });
});
