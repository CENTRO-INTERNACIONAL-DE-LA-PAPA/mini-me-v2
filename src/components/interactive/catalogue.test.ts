import { describe, expect, it } from "vitest";
import library from "../../../src-tauri/library/builtin.json";
import { rendererFor } from "./catalogue";

/** The kind each show tool adds (`sidecar/src/mini_me_sidecar/tools/`). */
const SHOW_TOOL_KINDS: Record<string, string> = {
  show_table: "table",
  show_chart: "chart",
  show_papers: "paper-sources",
  show_theories: "theories",
};

describe("catalogue", () => {
  it("draws every kind a built-in Trait's show tools add", () => {
    const tools = library.traits.flatMap((t) => (t as { tools?: string[] }).tools ?? []);
    const kinds = tools.filter((t) => t.startsWith("show_")).map((t) => SHOW_TOOL_KINDS[t]);
    expect(kinds.length).toBeGreaterThan(0);
    for (const kind of kinds) {
      expect(kind, "a show tool without a kind").toBeDefined();
      expect(rendererFor(kind, 1), kind).not.toBeNull();
    }
  });

  it("has no renderer for an unknown kind or version", () => {
    expect(rendererFor("charts", 1)).toBeNull();
    expect(rendererFor("theories", 9)).toBeNull();
    expect(rendererFor("toString", 1)).toBeNull();
  });
});
