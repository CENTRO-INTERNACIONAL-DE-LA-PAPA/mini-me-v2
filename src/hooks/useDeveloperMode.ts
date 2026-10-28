import { useEffect, useState } from "react";
import { api } from "../api";

// Every component shares one request; Settings calls `refreshDeveloperMode` after a change.
let loading: Promise<boolean> | null = null;
const listeners = new Set<(on: boolean) => void>();

function load(): Promise<boolean> {
  loading ??= api.getDeveloperMode().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

/** Whether developer options are shown; false until it has loaded. */
export function useDeveloperMode(): boolean {
  const [on, setOn] = useState(false);

  useEffect(() => {
    let active = true;
    const update = (next: boolean) => active && setOn(next);
    listeners.add(update);
    load()
      .then(update)
      .catch(() => {});
    return () => {
      active = false;
      listeners.delete(update);
    };
  }, []);

  return on;
}

/** Shows `on` wherever `useDeveloperMode` is used. */
export function refreshDeveloperMode(on: boolean): void {
  loading = Promise.resolve(on);
  listeners.forEach((update) => update(on));
}
