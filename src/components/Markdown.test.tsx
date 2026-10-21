import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "./Markdown";

describe("Markdown", () => {
  it("shows multi-line raw HTML as text with its line breaks", () => {
    const html = renderToStaticMarkup(<Markdown content={"<div>\nyield\n</div>"} />);
    expect(html).toContain("&lt;div&gt;");
    expect(html.match(/<br\/>/g)).toHaveLength(2);
  });
});
