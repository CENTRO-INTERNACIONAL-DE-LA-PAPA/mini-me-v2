import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderers, SHOWN_SOURCES } from "./paper-sources";

describe("paper-sources version 1", () => {
  const Sources = renderers[1];
  const papers = Array.from({ length: 18 }, (_, i) => ({
    title: `Paper ${i + 1}`,
    authors: ["A", "B", "C", "D"],
    year: 2020,
    url: i === 0 ? "file:///x" : `https://doi.org/${i}`,
  }));

  it("shows the first sources and offers the rest", () => {
    const html = renderToStaticMarkup(<Sources data={{ papers }} />);
    expect(html).toContain(`Paper ${SHOWN_SOURCES}<`);
    expect(html).not.toContain(`Paper ${SHOWN_SOURCES + 1}<`);
    expect(html).toContain("Show all sources (18)");
    expect(html).toContain("A, B, C et al. · 2020");
  });

  it("makes a card without a web address plain text", () => {
    const html = renderToStaticMarkup(<Sources data={{ papers: papers.slice(0, 2) }} />);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).not.toContain("Show all sources");
  });
});
