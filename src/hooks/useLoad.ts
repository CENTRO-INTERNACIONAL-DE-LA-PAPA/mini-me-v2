import { useEffect, useState, type DependencyList } from "react";
import { errorMessage } from "../api";

/** Runs `load` on mount and whenever `deps` change, keeping its result in `value` (undefined
 * until it lands) or why it failed in `error`. A run whose `load` returns undefined loads
 * nothing; a result that lands after a newer run or an unmount is dropped. */
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
