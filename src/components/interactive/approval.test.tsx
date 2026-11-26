import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { approvalState, renderers } from "./approval";

describe("approval version 1", () => {
  const Approval = renderers[1];
  const data = { step_id: "ask", prompt: "Design an experiment to test this plan's hypothesis?" };
  const render = (answer: unknown, replyStatus: "paused" | "streaming" | "cancelled") =>
    renderToStaticMarkup(<Approval preview={data} answer={answer} replyStatus={replyStatus} />);

  it("asks while the reply waits for an answer", () => {
    const html = render(null, "paused");
    expect(html).toContain("Design an experiment");
    expect(html).toContain("Approve");
    expect(html).toContain("Reject");
  });

  it("asks for a written answer with Send disabled until something is typed", () => {
    const written = { ...data, answer: "text" };
    const html = renderToStaticMarkup(
      <Approval preview={written} answer={null} replyStatus="paused" />,
    );
    expect(html).toContain("<textarea");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Send<\/button>/);
    expect(html).toContain("Skip");
    expect(html).not.toContain("Approve");
  });

  it("tells asking, answered and closed approvals apart", () => {
    expect(approvalState(null, "paused")).toBe("asking");
    expect(approvalState({ approved: true }, "streaming")).toBe("approved");
    expect(approvalState({ approved: false }, "complete")).toBe("rejected");
    expect(approvalState({ text: "yield" }, "streaming")).toBe("answered");
    expect(approvalState({ skipped: true }, "streaming")).toBe("skipped");
    expect(approvalState(null, "cancelled")).toBe("closed");
  });
});
