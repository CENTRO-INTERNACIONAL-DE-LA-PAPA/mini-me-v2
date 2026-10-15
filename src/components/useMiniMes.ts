import { useEffect, useState } from "react";
import { api } from "../api";
import type { MiniMe } from "../protocol/types";

// The Mini-Mes are fixed while the app runs, so every component shares one request.
let loading: Promise<MiniMe[]> | null = null;

/** The Mini-Mes, empty until they have loaded. */
export function useMiniMes(): MiniMe[] {
  const [miniMes, setMiniMes] = useState<MiniMe[]>([]);

  useEffect(() => {
    let active = true;
    loading ??= api.listMiniMes().catch((error) => {
      loading = null;
      throw error;
    });
    loading.then((list) => active && setMiniMes(list)).catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return miniMes;
}
