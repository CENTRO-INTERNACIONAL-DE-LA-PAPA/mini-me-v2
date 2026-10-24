import { describe, expect, it } from "vitest";
import type { MessageView } from "../../protocol/eventStore";
import { componentNames } from "./component-names";

const reply = (...components: Array<[string, object]>) =>
  ({
    components: components.map(([kind, data], i) => ({ id: JSON.stringify(data) + i, kind, data })),
  }) as unknown as MessageView;

describe("componentNames", () => {
  it("names a table after its file, its title or 'table', numbering repeats", () => {
    const messages = [
      reply(["table", { source: "field-trial-cleaned.csv", title: "Cleaned field-trial.csv" }]),
      reply(
        ["table", { title: "Columns of trial.csv" }],
        ["table", { title: "Columns of trial.csv" }],
      ),
      reply(["table", {}]),
    ];
    expect([...componentNames(messages).values()].map((c) => c.name)).toEqual([
      "field-trial-cleaned",
      "Columns-of-trial",
      "Columns-of-trial-2",
      "table",
    ]);
  });

  it("names a chart after its title or 'chart', numbering repeats across tables and charts", () => {
    const messages = [
      reply(["table", { source: "plots.csv" }], ["approval", { title: "Go on?" }]),
      reply(["chart", { title: "plots" }], ["chart", { title: "Yield — by variety" }], ["chart", {}]),
    ];
    expect([...componentNames(messages).values()]).toMatchObject([
      { name: "plots", kind: "table" },
      { name: "plots-2", kind: "chart" },
      { name: "Yield-by-variety", kind: "chart" },
      { name: "chart", kind: "chart" },
    ]);
  });
});
