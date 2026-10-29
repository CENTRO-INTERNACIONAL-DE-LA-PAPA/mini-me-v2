import { describe, expect, it } from "vitest";
import type { MessageView } from "../../protocol/eventStore";
import type { FileEntry, MiniMe } from "../../protocol/types";
import { documentsOf, draftSources } from "./ReportPanel";

const miniMe = (id: string, name: string) => ({ id, name }) as MiniMe;
const reply = (authorId: string, kind = "mini_me") =>
  ({ author: { kind, id: authorId } }) as unknown as MessageView;
const file = (name: string, created_at: number, modified_at: number | null) =>
  ({ id: name, name, created_at, modified_at }) as FileEntry;

describe("Report panel", () => {
  it("lists the Mini-Mes that replied, once each, in the order they first replied", () => {
    const miniMes = [miniMe("c", "Curator"), miniMe("p", "Plotter")];
    const messages = [reply("me", "user"), reply("p"), reply("c"), reply("p"), reply("gone")];
    expect(draftSources(messages, miniMes).map((m) => m.name)).toEqual(["Plotter", "Curator"]);
  });

  it("lists only documents, most recently edited first", () => {
    const files = [
      file("old.qmd", 1, 5),
      file("data.csv", 9, 9),
      file("new.qmd", 2, 8),
      file("unsaved.qmd", 3, null),
    ];
    expect(documentsOf(files).map((f) => f.name)).toEqual(["new.qmd", "old.qmd", "unsaved.qmd"]);
  });
});
