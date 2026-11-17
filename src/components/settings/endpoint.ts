const THIS_COMPUTER = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Whether a key and messages sent to `endpoint` would cross a network unencrypted. */
export function sendsUnencrypted(endpoint: string): boolean {
  try {
    const url = new URL(endpoint.trim());
    return url.protocol === "http:" && !THIS_COMPUTER.has(url.hostname);
  } catch {
    return false;
  }
}
