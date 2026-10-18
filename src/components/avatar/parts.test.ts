import { describe, expect, it } from "vitest";
import { ACCESSORIES, BASES, FACES, baseMarkup, partUrl } from "./parts";

describe("avatar parts", () => {
  it("loads every part with an id and label from its file name", () => {
    expect(BASES.length).toBeGreaterThan(0);
    expect(FACES.length).toBeGreaterThan(0);
    expect(ACCESSORIES.length).toBeGreaterThan(0);
    expect(BASES.find((p) => p.id === "red-bliss")).toMatchObject({ label: "red bliss" });
  });

  it("finds a part's url by id", () => {
    expect(partUrl(FACES, FACES[0].id)).toBe(FACES[0].url);
    expect(partUrl(FACES, "missing")).toBeNull();
    expect(partUrl(ACCESSORIES, null)).toBeNull();
  });

  it("colours every base through the avatar CSS variables", () => {
    for (const base of BASES) {
      expect(baseMarkup(base.id), base.id).toContain("var(--avatar-solid");
    }
  });
});
