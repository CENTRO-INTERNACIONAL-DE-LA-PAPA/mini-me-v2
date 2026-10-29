import { api } from "../api";
import type { MiniMe } from "../protocol/types";
import { sharedValue } from "./sharedValue";

const miniMes = sharedValue<MiniMe[]>(() => api.listMiniMes(), []);

/** The Mini-Mes, empty until they have loaded. */
export const useMiniMes = miniMes.use;

/** Loads the Mini-Mes again and shows the new list wherever `useMiniMes` is used; the editors
 * call it after a change. */
export const refreshMiniMes = miniMes.reload;
