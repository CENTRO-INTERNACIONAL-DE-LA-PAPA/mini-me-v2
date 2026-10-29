import { api } from "../api";
import { sharedValue } from "./sharedValue";

const developerMode = sharedValue(() => api.getDeveloperMode(), false);

/** Whether developer options are shown; false until it has loaded. */
export const useDeveloperMode = developerMode.use;

/** Shows `on` wherever `useDeveloperMode` is used; Settings calls it after a change. */
export const refreshDeveloperMode = developerMode.show;
