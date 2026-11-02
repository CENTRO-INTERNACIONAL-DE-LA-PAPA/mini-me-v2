import { describe, expect, it } from "vitest";
import type { QuartoStatus } from "../../protocol/types";
import { documentsBlocked, quartoNotice } from "./quarto";

const status = (state: QuartoStatus["state"], version: string | null = null): QuartoStatus => ({
  state,
  version,
  path: "/opt/quarto/bin/quarto",
  chosen: false,
  minimum: "1.10",
  install_url: "https://quarto.org/docs/download/",
});

describe("Quarto gating", () => {
  it("blocks document work unless Quarto is found, and not before it has been looked up", () => {
    expect(documentsBlocked(null)).toBe(false);
    expect(documentsBlocked(status("found", "1.10.18"))).toBe(false);
    for (const state of ["missing", "too_old", "broken"] as const) {
      expect(documentsBlocked(status(state))).toBe(true);
    }
  });

  it("says what is wrong with a Quarto that cannot be used", () => {
    expect(quartoNotice(status("missing"))).toContain("Install it");
    expect(quartoNotice(status("too_old", "1.9.9"))).toMatch(/1\.9\.9.*1\.10 or later/);
    expect(quartoNotice(status("broken"))).toContain("/opt/quarto/bin/quarto");
  });
});
