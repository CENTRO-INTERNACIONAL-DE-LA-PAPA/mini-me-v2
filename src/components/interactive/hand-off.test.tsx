import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HandOffCard } from "./hand-off";

describe("hand-off version 1", () => {
  it("shows the Mini-Me, the request and the file", () => {
    const html = renderToStaticMarkup(
      <HandOffCard name="Profiler" request="profile this table" fileName="field-trial.csv" />,
    );
    expect(html).toContain("@Profiler");
    expect(html).toContain("profile this table");
    expect(html).toContain("#field-trial.csv");
  });

  it("shows no file chip without a file", () => {
    const html = renderToStaticMarkup(<HandOffCard name="Profiler" request="profile it" />);
    expect(html).not.toContain("Open file");
  });
});
