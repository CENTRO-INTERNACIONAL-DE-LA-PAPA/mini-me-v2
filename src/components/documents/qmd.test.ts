import { describe, expect, it } from "vitest";
import { headerField, headings } from "./qmd";

const DOCUMENT = `---
title: "Huancayo 2025"
# set by the trial team
author: [Ana, Luis]
---

# Summary

Yield fell.

\`\`\`{python}
# not a heading
\`\`\`

## Next steps ##
`;

describe("qmd", () => {
  it("reads the title and authors from the header", () => {
    expect(headerField(DOCUMENT, "title")).toBe("Huancayo 2025");
    expect(headerField(DOCUMENT, "author")).toBe("Ana, Luis");
  });

  it("gives nothing for a missing or unreadable header", () => {
    expect(headerField("# No header\n", "title")).toBe("");
    expect(headerField("---\ntitle: [unclosed\n---\n", "title")).toBe("");
  });

  it("lists headings with their lines, outside the header and code", () => {
    expect(headings(DOCUMENT)).toEqual([
      { level: 1, text: "Summary", line: 7 },
      { level: 2, text: "Next steps", line: 15 },
    ]);
  });
});
