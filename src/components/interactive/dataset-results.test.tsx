import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Dataset } from "../../protocol/types";
import { datasetByline, renderers } from "./dataset-results";

const dataset = (n: number): Dataset => ({
  id: `doi:10.21223/${n}`,
  title: `Late blight trials ${n}`,
  authors: ["Atieno, Elly", "Pérez, Ana", "Quispe, Rosa", "Mamani, Luis"],
  year: 2021,
  url: `https://doi.org/10.21223/${n}`,
  description: "Field trials.",
  files: 3,
});

describe("dataset-results version 1", () => {
  const Results = renderers[1];

  it("names three authors and the year", () => {
    expect(datasetByline(dataset(1))).toBe("Atieno, Elly; Pérez, Ana; Quispe, Rosa et al. (2021)");
    expect(datasetByline({ ...dataset(1), authors: [], year: null })).toBe("");
  });

  it("offers more datasets while more match, and files only inside a Project", () => {
    const data = { query: "late blight", from_year: null, to_year: null, total: 213 };
    const page = renderToStaticMarkup(
      <Results data={{ ...data, datasets: [dataset(1), dataset(2)] }} projectId="p" />,
    );
    expect(page).toContain("Show more");
    expect(page).toContain("Files (3)");

    const all = renderToStaticMarkup(<Results data={{ ...data, total: 1, datasets: [dataset(1)] }} />);
    expect(all).not.toContain("Show more");
    expect(all).not.toContain("Files (3)");
  });
});
