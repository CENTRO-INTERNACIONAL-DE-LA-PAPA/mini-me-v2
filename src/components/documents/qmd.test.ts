import { describe, expect, it } from "vitest";
import { headerField } from "./qmd";

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
  it("reads the title and authors from the header, and nothing from a bad one", () => {
    expect(headerField(DOCUMENT, "title")).toBe("Huancayo 2025");
    expect(headerField(DOCUMENT, "author")).toBe("Ana, Luis");
    expect(headerField("# No header\n", "title")).toBe("");
    expect(headerField("---\ntitle: [unclosed\n---\n", "title")).toBe("");
  });
});
