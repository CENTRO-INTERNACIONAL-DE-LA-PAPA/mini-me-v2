import { describe, expect, it } from "vitest";
import { END_ID, layoutWorkflow } from "./workflowLayout";

describe("layoutWorkflow", () => {
  it("keeps a Step named like the end pill apart from it", () => {
    const { nodes } = layoutWorkflow([{ id: "end", type: "trait", trait: "t" }]);
    expect(nodes.filter((n) => n.id === "end")).toHaveLength(1);
    expect(nodes.filter((n) => n.id === END_ID)).toHaveLength(1);
  });
});
