import { describe, expect, it } from "vitest";
import { sendsUnencrypted } from "./endpoint";

describe("sendsUnencrypted", () => {
  it("flags plain HTTP only when it leaves this computer", () => {
    expect(sendsUnencrypted("http://models.example.org/v1")).toBe(true);
    expect(sendsUnencrypted(" http://192.168.1.20:8000 ")).toBe(true);
    expect(sendsUnencrypted("http://localhost:1234/v1")).toBe(false);
    expect(sendsUnencrypted("http://127.0.0.1:11434/v1")).toBe(false);
    expect(sendsUnencrypted("http://[::1]:8080")).toBe(false);
    expect(sendsUnencrypted("https://models.example.org/v1")).toBe(false);
    expect(sendsUnencrypted("not a url")).toBe(false);
  });
});
