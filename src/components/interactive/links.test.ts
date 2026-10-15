import { describe, expect, it } from "vitest";
import { webUrl } from "./links";

describe("webUrl", () => {
  it("allows only web addresses", () => {
    expect(webUrl("https://doi.org/10.1/x")).toBe("https://doi.org/10.1/x");
    expect(webUrl(" http://example.org ")).toBe("http://example.org");
    expect(webUrl("file:///etc/passwd")).toBeNull();
    expect(webUrl("javascript:alert(1)")).toBeNull();
    expect(webUrl(null)).toBeNull();
  });
});
