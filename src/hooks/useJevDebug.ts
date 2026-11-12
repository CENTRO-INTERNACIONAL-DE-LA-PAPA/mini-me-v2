import { api } from "../api";
import { sharedValue } from "./sharedValue";

/** Which parts of Jev's debug record the developer settings show. */
export interface JevDebug {
  answers: boolean;
  asked: boolean;
}

const jevDebug = sharedValue<JevDebug>(
  () => api.getAiSettings().then((s) => ({ answers: s.show_answers, asked: s.show_asked })),
  { answers: false, asked: false },
);

/** The Jev debug settings; both off until they have loaded. */
export const useJevDebug = jevDebug.use;

/** Shows `settings` wherever `useJevDebug` is used. */
export const refreshJevDebug = jevDebug.show;
