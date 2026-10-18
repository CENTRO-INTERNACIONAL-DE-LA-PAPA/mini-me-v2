import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderers } from "./approval";

describe("approval version 1", () => {
  const Approval = renderers[1];
  const data = { step_id: "ask", prompt: "Design an experiment to test this plan's hypothesis?" };
  const render = (answer: unknown, replyStatus: "paused" | "streaming" | "cancelled") =>
    renderToStaticMarkup(<Approval data={data} answer={answer} replyStatus={replyStatus} />);

  it("asks while the reply waits for an answer", () => {
    const html = render(null, "paused");
    expect(html).toContain("Design an experiment");
    expect(html).toContain("Approve");
    expect(html).toContain("Reject");
  });

  it("shows the answer instead of the buttons once answered", () => {
    const html = render({ approved: true }, "streaming");
    expect(html).toContain("Approved");
    expect(html).not.toContain("<button");
    expect(render({ approved: false }, "streaming")).toContain("Rejected");
  });

  it("shows neither buttons nor an answer when the reply was stopped first", () => {
    const html = render(null, "cancelled");
    expect(html).not.toContain("<button");
    expect(html).not.toMatch(/Approved|Rejected/);
  });
});
