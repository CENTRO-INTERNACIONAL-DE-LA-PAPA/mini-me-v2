import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api";
import type { UpdateStatus } from "../../protocol/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateLabel } from "./updateLabel";

/** Shows an update downloading or ready to install. Renders nothing otherwise. */
export function UpdateStatusLine() {
  const [status, setStatus] = useState<UpdateStatus>({ state: "none" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .subscribeUpdateStatus((next) => {
        if (active) {
          setStatus(next);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const label = updateLabel(status);
  if (!label) {
    return null;
  }

  async function restart() {
    try {
      setError(null);
      await api.restartToUpdate();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div role="status" className="flex items-start gap-2 text-meta text-muted-foreground">
      <span
        aria-hidden
        className={cn(
          "mt-1.5 size-[7px] shrink-0 rounded-full",
          status.state === "ready" ? "bg-success" : "bg-off",
        )}
      />
      <p className="flex-1">
        {label}
        {error && <span className="block text-destructive">{error}</span>}
      </p>
      {status.state === "ready" && (
        <Button variant="outline" size="xs" onClick={restart}>
          Restart
        </Button>
      )}
    </div>
  );
}
