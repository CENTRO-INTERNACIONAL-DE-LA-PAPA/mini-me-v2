import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Component } from "../../protocol/types";
import { InteractiveComponent } from "./InteractiveComponent";

function component(kind: string, version: number): Component {
  return { id: "c", kind, version, data: { papers: [] }, text: "1. Late blight", answer: null };
}

describe("InteractiveComponent", () => {
  it("shows the text of a kind or version this app cannot draw", () => {
    const unknown = [component("charts", 1), component("paper-sources", 9), component("toString", 1)];
    for (const shown of unknown) {
      const html = renderToStaticMarkup(<InteractiveComponent component={shown} />);
      expect(html, `${shown.kind} ${shown.version}`).toContain("1. Late blight");
    }
  });
});
