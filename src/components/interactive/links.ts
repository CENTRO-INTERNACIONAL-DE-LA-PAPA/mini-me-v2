import { openUrl } from "@tauri-apps/plugin-opener";

/** `url` when it is a web address the browser may open, otherwise null. */
export function webUrl(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}

/** Opens a web address from `webUrl` in the system's default browser. */
export function openLink(url: string) {
  openUrl(url).catch((e) => console.error("could not open", url, e));
}
