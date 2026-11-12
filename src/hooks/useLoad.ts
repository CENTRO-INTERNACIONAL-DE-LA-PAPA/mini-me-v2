import { useEffect, useState, type DependencyList } from "react";
import { errorMessage } from "../api";

/** `load`'s result for the current `deps`; a run whose `load` returns undefined loads nothing. */
export function useLoad<T>(load: () => Promise<T> | undefined, deps: DependencyList) {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loading = load();
    if (!loading) return;
    let active = true;
    loading.then(
      (loaded) => active && setValue(loaded),
      (e) => active && setError(errorMessage(e)),
    );
    return () => {
      active = false;
    };
  }, deps);

  return { value, setValue, error, setError };
}
