import { describe, expect, it } from "vitest";
import type { MessageView } from "../../protocol/eventStore";
import type { Author, AssetRef, Component, TextComponent } from "../../protocol/types";
import { componentNames } from "../interactive/component-names";
import { outline } from "./outline";

const CURATOR = "curator-id";
const TRIAL: AssetRef = { id: "trial-id", name: "field-trial.csv", media_type: "text/csv", size_bytes: 1 };

function message(
  id: string,
  author: Author,
  parts: {
    attachments?: AssetRef[];
    text_components?: Array<Pick<TextComponent, "kind" | "id" | "label">>;
    components?: Array<Pick<Component, "id" | "kind" | "data">>;
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
        components: [{ id: "table-id", kind: "table", data: { source: "field-trial-cleaned.csv" } }],
      }),
    ];
    const result = outline(messages, componentNames(messages));
    expect(result.miniMes).toEqual([{ id: CURATOR, label: "Curator", messageIds: ["ask", "reply"] }]);
    expect(result.files).toEqual([{ id: TRIAL.id, label: "field-trial.csv", messageIds: ["ask"] }]);
    expect(result.components).toEqual([
      { id: "table-id", label: "field-trial-cleaned", messageIds: ["reply"] },
    ]);
  });

  it("counts a file once per message across attachments and # references", () => {
    const reference = { kind: "asset" as const, id: TRIAL.id, label: "#field-trial.csv" };
    const messages = [
      message("one", user, { attachments: [TRIAL], text_components: [reference] }),
      message("two", user, { text_components: [reference] }),
      message("three", user, { text_components: [reference, reference] }),
    ];
    expect(outline(messages, componentNames(messages)).files).toEqual([
      { id: TRIAL.id, label: "field-trial.csv", messageIds: ["one", "two", "three"] },
    ]);
  });

  it("is empty for an empty Conversation", () => {
    expect(outline([], new Map())).toEqual({ miniMes: [], files: [], components: [] });
  });
});
