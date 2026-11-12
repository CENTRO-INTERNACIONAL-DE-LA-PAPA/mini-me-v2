import { useEffect, useState } from "react";

/** A value all components share from one `request`: `use` reads it (`initial` until loaded),
 * `show` sets an already known value everywhere, and `reload` requests it again. */
export function sharedValue<T>(request: () => Promise<T>, initial: T) {
  let loading: Promise<T> | null = null;
  const listeners = new Set<(value: T) => void>();

  function load(): Promise<T> {
    loading ??= request().catch((error) => {
      loading = null;
      throw error;
    });
    return loading;
  }

  function show(value: T): void {
    loading = Promise.resolve(value);
    listeners.forEach((update) => update(value));
  }

  function use(): T {
    const [value, setValue] = useState(initial);

    useEffect(() => {
      let active = true;
      const update = (next: T) => active && setValue(next);
      listeners.add(update);
      load()
        .then(update)
        .catch(() => {});
      return () => {
        active = false;
        listeners.delete(update);
      };
    }, []);

    return value;
  }

  function reload(): void {
    loading = null;
    load()
      .then(show)
      .catch(() => {});
  }

  return { use, show, reload };
}
