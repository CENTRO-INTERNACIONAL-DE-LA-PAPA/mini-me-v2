import { describe, expect, it } from "vitest";
import library from "../../../src-tauri/library/builtin.json";
import { rendererFor } from "./catalogue";

describe("catalogue", () => {
  it("draws every kind a built-in Trait lists", () => {
    const listed = library.traits.flatMap(
      (t) => ((t as { components?: string[] }).components ?? []),
    );
    for (const kind of listed) {
      expect(rendererFor(kind, 1), kind).not.toBeNull();
    }
  });

  it("has no renderer for an unknown kind or version", () => {
    expect(rendererFor("charts", 1)).toBeNull();
    expect(rendererFor("theories", 9)).toBeNull();
    expect(rendererFor("toString", 1)).toBeNull();
  });
});
