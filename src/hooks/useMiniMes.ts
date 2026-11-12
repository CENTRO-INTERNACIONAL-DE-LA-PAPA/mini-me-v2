import { api } from "../api";
import type { MiniMe } from "../protocol/types";
import { sharedValue } from "./sharedValue";

const miniMes = sharedValue<MiniMe[]>(() => api.listMiniMes(), []);

/** The Mini-Mes, empty until they have loaded. */
export const useMiniMes = miniMes.use;

/** Reloads the Mini-Mes wherever `useMiniMes` is used. */
export const refreshMiniMes = miniMes.reload;
