import { useEffect, useState } from "react";

const listeners = new Set<(projectId: string) => void>();

/** Tells every `useFilesChanged(projectId)` its files changed without a message (a download). */
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
