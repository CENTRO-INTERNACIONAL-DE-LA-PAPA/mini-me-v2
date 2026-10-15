import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderers, worded } from "./theories";

describe("worded", () => {
  it("falls back to the plain text when there is no technical one", () => {
    expect(worded({ plain: "Leaves", technical: "Canopy" }, "technical")).toBe("Canopy");
    expect(worded({ plain: "Leaves", technical: null }, "technical")).toBe("Leaves");
    expect(worded({ plain: "Leaves", technical: "Canopy" }, "plain")).toBe("Leaves");
  });
});

describe("theories version 1", () => {
  const Theories = renderers[1];
  const data = {
    theories: [
      {
        name: { plain: "Leaves that last make bigger tubers", technical: "Canopy persistence law" },
        description: { plain: "Green leaves fill tubers.", technical: null },
        statements: [
          {
            text: { plain: "Drought cuts tuber weight.", technical: "tech" },
            evidence: [{ text: "Field trials link rainfall to tuber weight.", refs: [1, 2] }],
          },
        ],
      },
    ],
    references: [
      { title: "Root traits under drought", year: 2021, url: "https://doi.org/10.1/root" },
      { title: "Tuber bulking", year: null, url: null },
    ],
  };

  it("shows plain wording first, with citations linking to the references", () => {
    const html = renderToStaticMarkup(<Theories data={data} />);
    expect(html).toContain("1. Leaves that last make bigger tubers");
    expect(html).not.toContain("Canopy persistence law");
    const anchors = [...html.matchAll(/href="#(ref-[^"]+)"/g)].map((m) => m[1]);
    expect(anchors).toHaveLength(2);
    for (const anchor of anchors) expect(html).toContain(`id="${anchor}"`);
    expect(html).toContain("Root traits under drought (2021)");
  });
});
