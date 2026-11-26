import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderers } from "./document";

describe("document version 1", () => {
  it("treats data without a document as removed", () => {
    const Document = renderers[1];
    const html = renderToStaticMarkup(<Document preview={{ title: "Lost" }} />);
    expect(html).toContain("was removed");
  });
});
