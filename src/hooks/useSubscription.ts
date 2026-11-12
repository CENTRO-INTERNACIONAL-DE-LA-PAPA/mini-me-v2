import { useEffect, useState } from "react";

/** The latest value `subscribe` sends, or `initial` until one arrives or if it fails. */
export function useSubscription<T>(
  subscribe: (onNext: (next: T) => void) => Promise<unknown>,
  initial: T,
): T {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    let active = true;
    subscribe((next) => {
      if (active) {
        setValue(next);
      }
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return value;
}
