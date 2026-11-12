import { api } from "../api";
import type { UserProfile } from "../protocol/types";
import { sharedValue } from "./sharedValue";

const profile = sharedValue<UserProfile | null>(() => api.getUserProfile(), null);

/** The user's profile, null until it has loaded. */
export const useUserProfile = profile.use;

/** Shows `profile` wherever `useUserProfile` is used. */
export const refreshUserProfile = profile.show;
