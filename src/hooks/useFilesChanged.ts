import { useEffect, useState } from "react";

const listeners = new Set<(projectId: string) => void>();

/** Tells every `useFilesChanged` of `projectId` that its files changed without a message, such
 * as by a download, so lists and counts of the Project's files read them again. */
export function announceFilesChanged(projectId: string): void {
  listeners.forEach((listener) => listener(projectId));
}

/** A number that changes each time `projectId`'s files are announced as changed. */
export function useFilesChanged(projectId: string | undefined): number {
  const [changes, setChanges] = useState(0);
  useEffect(() => {
    const listener = (changed: string) => changed === projectId && setChanges((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [projectId]);
  return changes;
}
