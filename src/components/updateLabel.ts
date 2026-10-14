import type { UpdateStatus } from "../protocol/types";

/** The text shown for an update; null when there is nothing to show. */
export function updateLabel(status: UpdateStatus): string | null {
  switch (status.state) {
    case "none":
      return null;
    case "downloading":
      return status.percent === null
        ? `Downloading update ${status.version}`
        : `Downloading update ${status.version} · ${status.percent}%`;
    case "ready":
      return `Mini-Me ${status.version} is ready`;
  }
}
