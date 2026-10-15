import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Component } from "../../protocol/types";
import { InteractiveComponent } from "./InteractiveComponent";

function component(kind: string, version: number): Component {
  return { id: "c", kind, version, data: { papers: [] }, text: "1. Late blight" };
}

describe("InteractiveComponent", () => {
  it("shows the text of a kind this app does not know", () => {
    expect(
      renderToStaticMarkup(<InteractiveComponent component={component("charts", 1)} />),
    ).toContain("1. Late blight");
  });

  it("shows the text of an unknown version of a known kind", () => {
    expect(
      renderToStaticMarkup(<InteractiveComponent component={component("paper-sources", 9)} />),
    ).toContain("1. Late blight");
  });
});
