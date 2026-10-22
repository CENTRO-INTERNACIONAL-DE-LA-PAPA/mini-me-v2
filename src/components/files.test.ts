import { describe, expect, it } from "vitest";
import { fileKind } from "./files";

describe("fileKind", () => {
  it("groups files by media type, then by name", () => {
    expect(fileKind("text/csv", "trial.csv")).toBe("data");
    expect(fileKind("application/octet-stream", "yield.xlsx")).toBe("data");
    expect(fileKind("application/pdf", "Perez_2019.pdf")).toBe("document");
    expect(fileKind("text/markdown", "notes.md")).toBe("document");
    expect(fileKind("image/png", "plot.png")).toBe("image");
    expect(fileKind("application/zip", "archive.zip")).toBe("other");
  });
});
