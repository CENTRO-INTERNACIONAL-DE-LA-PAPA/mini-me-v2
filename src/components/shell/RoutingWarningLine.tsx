import { useEffect, useState } from "react";
import { api } from "../../api";

/** Says why Mini-Mes are not chosen automatically. Renders nothing while Jev chooses them. */
export function RoutingWarningLine() {
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .subscribeRoutingWarning((next) => {
        if (active) {
          setWarning(next);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!warning) {
    return null;
  }

  return (
    <div role="status" className="flex items-start gap-2 text-meta text-muted-foreground">
      <span aria-hidden className="mt-1.5 size-[7px] shrink-0 rounded-full bg-off" />
      <p className="flex-1">{warning}</p>
    </div>
  );
}
