import { useEffect, useState } from "react";
import { api } from "../api";
import type { UserProfile } from "../protocol/types";

// Every component shares one request; Settings calls `refreshUserProfile` after a save.
let loading: Promise<UserProfile> | null = null;
const listeners = new Set<(profile: UserProfile) => void>();

function load(): Promise<UserProfile> {
  loading ??= api.getUserProfile().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

/** The user's profile, null until it has loaded. */
export function useUserProfile(): UserProfile | null {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    let active = true;
    const update = (next: UserProfile) => active && setProfile(next);
    listeners.add(update);
    load()
      .then(update)
      .catch(() => {});
    return () => {
      active = false;
      listeners.delete(update);
    };
  }, []);

  return profile;
}

/** Shows `profile` wherever `useUserProfile` is used. */
export function refreshUserProfile(profile: UserProfile): void {
  loading = Promise.resolve(profile);
  listeners.forEach((update) => update(profile));
}
