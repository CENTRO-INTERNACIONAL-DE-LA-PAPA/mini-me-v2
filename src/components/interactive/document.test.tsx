import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentCard, renderers } from "./document";

describe("document version 1", () => {
  it("shows the document's title with an Open button", () => {
    const html = renderToStaticMarkup(
      <DocumentCard title="Huancayo 2025 report" removed={false} onOpen={() => {}} />,
    );
    expect(html).toContain("Huancayo 2025 report");
    expect(html).toContain(">Open<");
  });

  it("says a removed document was removed, with no Open", () => {
    const html = renderToStaticMarkup(
      <DocumentCard title="Huancayo 2025 report" removed onOpen={() => {}} />,
    );
    expect(html).toContain("This document was removed from the Project.");
    expect(html).not.toContain(">Open<");
  });

  it("treats data without a document as removed", () => {
    const Document = renderers[1];
    const html = renderToStaticMarkup(<Document data={{ title: "Lost" }} />);
    expect(html).toContain("was removed");
  });
});
