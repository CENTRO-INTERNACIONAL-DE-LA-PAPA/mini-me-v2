import { useEffect, useState } from "react";
import { api } from "../api";
import type { MiniMe } from "../protocol/types";

// Every component shares one request; the editors call `refreshMiniMes` after a change.
let loading: Promise<MiniMe[]> | null = null;
const listeners = new Set<(list: MiniMe[]) => void>();

function load(): Promise<MiniMe[]> {
  loading ??= api.listMiniMes().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

/** The Mini-Mes, empty until they have loaded. */
export function useMiniMes(): MiniMe[] {
  const [miniMes, setMiniMes] = useState<MiniMe[]>([]);

  useEffect(() => {
    let active = true;
    const update = (list: MiniMe[]) => active && setMiniMes(list);
    listeners.add(update);
    load()
      .then(update)
      .catch(() => {});
    return () => {
      active = false;
      listeners.delete(update);
    };
  }, []);

  return miniMes;
}

/** Loads the Mini-Mes again and shows the new list wherever `useMiniMes` is used. */
export function refreshMiniMes(): void {
  loading = null;
  load()
    .then((list) => listeners.forEach((update) => update(list)))
    .catch(() => {});
}
