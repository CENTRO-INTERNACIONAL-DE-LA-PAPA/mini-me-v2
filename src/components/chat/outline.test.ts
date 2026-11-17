import { describe, expect, it } from "vitest";
import type { MessageView } from "../../protocol/eventStore";
import type { Author, AssetRef, Component, TextComponent } from "../../protocol/types";
import { outline } from "./outline";

const CURATOR = "curator-id";
const TRIAL: AssetRef = { id: "trial-id", name: "field-trial.csv", media_type: "text/csv", size_bytes: 1 };

function message(
  id: string,
  author: Author,
  parts: {
    attachments?: AssetRef[];
    text_components?: Array<Pick<TextComponent, "kind" | "id" | "label">>;
    components?: Array<Pick<Component, "id" | "kind" | "preview">>;
  } = {},
): MessageView {
  return {
    id,
    author,
    attachments: parts.attachments ?? [],
    text_components: parts.text_components ?? [],
    components: parts.components ?? [],
  } as unknown as MessageView;
}

const user: Author = { kind: "user", id: "me" };
const curator: Author = { kind: "mini_me", id: CURATOR };

describe("outline", () => {
  it("lists the Mini-Me, the file and the table a cleaning uses", () => {
    const messages = [
      message("ask", user, {
        attachments: [TRIAL],
        text_components: [{ kind: "mini_me", id: CURATOR, label: "@Curator" }],
      }),
      message("reply", curator, {
        components: [
          { id: "table-id", kind: "table", preview: { source: "field-trial-cleaned.csv" } },
          { id: "chart-id", kind: "chart", preview: { title: "Yield by variety" } },
          { id: "plain-id", kind: "chart", preview: {} },
          { id: "papers-id", kind: "paper-sources", preview: { title: "Papers" } },
        ],
      }),
    ];
    const result = outline(messages);
    expect(result.miniMes).toEqual([{ id: CURATOR, label: "Curator", messageIds: ["ask", "reply"] }]);
    expect(result.files).toEqual([{ id: TRIAL.id, label: "field-trial.csv", messageIds: ["ask"] }]);
    expect(result.components).toEqual([
      { id: "table-id", label: "field-trial-cleaned.csv", messageIds: ["reply"] },
      { id: "chart-id", label: "Yield by variety", messageIds: ["reply"] },
      { id: "plain-id", label: "Chart", messageIds: ["reply"] },
    ]);
  });

  it("counts a file once per message across attachments and # references", () => {
    const reference = { kind: "asset" as const, id: TRIAL.id, label: "#field-trial.csv" };
    const messages = [
      message("one", user, { attachments: [TRIAL], text_components: [reference] }),
      message("two", user, { text_components: [reference] }),
      message("three", user, { text_components: [reference, reference] }),
    ];
    expect(outline(messages).files).toEqual([
      { id: TRIAL.id, label: "field-trial.csv", messageIds: ["one", "two", "three"] },
    ]);
  });
});
