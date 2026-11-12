import { useState } from "react";
import { api, errorMessage } from "../../api";
import { useSubscription } from "../../hooks/useSubscription";
import type { SidecarStatus } from "../../protocol/types";
import { Button } from "@/components/ui/button";
import { StatusRow } from "./StatusRow";

/** The sidecar's status, kept current; null until the first status arrives. */
export function useSidecarStatus(): SidecarStatus | null {
  return useSubscription<SidecarStatus | null>(api.subscribeSidecarStatus, null);
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
    <StatusRow
      error={error}
      action={
        status.state === "stopped" && (
          <Button variant="outline" size="xs" onClick={restart}>
            Try again
          </Button>
        )
      }
    >
      {status.detail}
    </StatusRow>
  );
}
