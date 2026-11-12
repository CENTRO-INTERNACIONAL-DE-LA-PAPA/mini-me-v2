import { api } from "../api";
import type { FeatureFlag } from "../protocol/types";
import { sharedValue } from "./sharedValue";

const featureFlags = sharedValue<FeatureFlag[]>(() => api.listFeatureFlags(), []);

/** The feature flags that are on; none until they have loaded. */
export const useFeatureFlags = featureFlags.use;

/** Asks the core again which flags are on. */
export const reloadFeatureFlags = featureFlags.reload;
