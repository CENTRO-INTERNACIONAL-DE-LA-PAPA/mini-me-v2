import { api } from "../api";
import type { QuartoStatus } from "../protocol/types";
import { sharedValue } from "./sharedValue";

const quarto = sharedValue<QuartoStatus | null>(() => api.quartoStatus(), null);

/** The user's Quarto, which documents need, as looked up at start; null until the app answers. */
export const useQuarto = quarto.use;

/** Looks for Quarto again and shows the result wherever `useQuarto` is used. */
export function recheckQuarto(): void {
  api
    .recheckQuarto()
    .then(quarto.show)
    .catch(() => {});
}

/** Shows a status already known, as after Settings changes where Quarto is. */
export const showQuarto = quarto.show;
