import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderers, SuggestionCard } from "./suggestion";

const Suggestion = renderers[1];
const data = { document_id: "d", base: "Yield fell.", text: "Yield fell above 3,800 m." };

function pending(state: { problem?: string; canAccept?: boolean }) {
  return renderToStaticMarkup(<SuggestionCard text={data.text} decision={null} {...state} />);
}

describe("suggestion version 1", () => {
  it("shows an answered suggestion's text with its decision and no buttons", () => {
    const html = renderToStaticMarkup(<Suggestion data={data} answer={{ decision: "rejected" }} />);
    expect(html).toContain("Yield fell above 3,800 m.");
    expect(html).toContain("Discarded");
    expect(html).not.toContain("<button");
  });

  it("offers Accept and resolve and Discard while pending in a thread", () => {
    const html = pending({ canAccept: true });
    expect(html).toContain("Accept and resolve");
    expect(html).toContain("Discard");
  });

  it("says why on a conflict, without Accept", () => {
    const html = pending({ problem: "You've changed the same words." });
    expect(html).toContain("You&#x27;ve changed the same words.");
    expect(html).not.toContain("Accept and resolve");
    expect(html).toContain("Discard");
  });

  it("offers only Discard outside a thread whose passage is found", () => {
    const html = renderToStaticMarkup(<Suggestion data={data} answer={null} />);
    expect(html).not.toContain("Accept and resolve");
    expect(html).toContain("Discard");
  });
});
