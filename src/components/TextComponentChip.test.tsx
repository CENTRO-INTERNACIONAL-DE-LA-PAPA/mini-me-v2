import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TextComponentChip } from "./TextComponentChip";

describe("TextComponentChip", () => {
  it("draws a $ reference as a chip that opens no file", () => {
    const label = "$trial";
    const component = { kind: "component" as const, id: "c1", label, start: 0, end: label.length };
    const html = renderToStaticMarkup(
      <TextComponentChip component={component} miniMes={[]} onOpenAsset={() => {}}>
        {label}
      </TextComponentChip>,
    );
    expect(html).toContain(label);
    expect(html).not.toContain("<button");
  });
});
