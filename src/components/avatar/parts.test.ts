import { describe, expect, it } from "vitest";
import library from "../../../src-tauri/library/builtin.json";
import { LAYERS, adapt, partMarkup } from "./parts";

const layer = (name: string) => LAYERS.find((l) => l.name === name)!;

describe("avatar parts", () => {
  it("loads parts for every required layer, with ids and labels from their file names", () => {
    for (const { name, required, parts } of LAYERS) {
      if (required) expect(parts.length, name).toBeGreaterThan(0);
    }
    expect(layer("base").parts.find((p) => p.id === "red-bliss")).toMatchObject({
      label: "red bliss",
    });
  });

  it("adapts an export's placeholder colours, blink ids and root", () => {
    const exported =
      '<svg viewBox="0 0 280 280"><path fill="#F5B800"/><path fill="#7a5a00"/>' +
      '<path id="blink" fill="#0A0A0A"/><path id="blink_2" fill="#0A0A0A"/></svg>';
    expect(adapt(exported)).toBe(
      '<svg class="size-full" viewBox="0 0 280 280">' +
        '<path style="fill: var(--avatar-solid, #F5B800)"/>' +
        '<path style="fill: var(--avatar-ink, #7A5A00)"/>' +
        '<path class="blink" fill="#0A0A0A"/><path class="blink" fill="#0A0A0A"/></svg>',
    );
  });

  it("colours every base through the avatar CSS variables", () => {
    for (const base of layer("base").parts) {
      expect(base.markup, base.id).toContain("var(--avatar-solid");
    }
  });

  it("draws every built-in Mini-Me from parts that exist", () => {
    for (const { name, avatar } of library.mini_mes) {
      const parts = avatar as Record<string, string>;
      for (const l of LAYERS) {
        if (!l.required && !parts[l.name]) continue;
        expect(partMarkup(l, parts[l.name]), `${name} ${l.name}`).not.toBeNull();
      }
    }
  });
});
