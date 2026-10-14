import { useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import type { SidecarStatus } from "../protocol/types";
import { Button } from "@/components/ui/button";

/** The sidecar's status, kept current; null until the first status arrives. */
export function useSidecarStatus(): SidecarStatus | null {
  const [status, setStatus] = useState<SidecarStatus | null>(null);

  useEffect(() => {
    let active = true;
    api
      .subscribeSidecarStatus((next) => {
        if (active) {
          setStatus(next);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return status;
}

export function sidecarReady(status: SidecarStatus | null): boolean {
  return status?.state === "ready";
}

/** Explains why Mini-Me cannot answer right now. Renders nothing while the sidecar is ready. */
export function SidecarStatusLine({ status }: { status: SidecarStatus | null }) {
  const [error, setError] = useState<string | null>(null);

  if (!status || status.state === "ready") {
    return null;
  }

  async function restart() {
    try {
      setError(null);
      await api.restartSidecar();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div role="status" className="flex items-start gap-2 text-meta text-muted-foreground">
      <span aria-hidden className="mt-1.5 size-[7px] shrink-0 rounded-full bg-off" />
      <p className="flex-1">
        {status.detail}
        {error && <span className="block text-destructive">{error}</span>}
      </p>
      {status.state === "stopped" && (
        <Button variant="outline" size="xs" onClick={restart}>
          Try again
        </Button>
      )}
    </div>
  );
}
