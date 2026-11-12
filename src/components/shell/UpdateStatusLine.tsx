import { useState } from "react";
import { RefreshCwIcon } from "lucide-react";
import { api, errorMessage } from "../../api";
import { useSubscription } from "../../hooks/useSubscription";
import type { UpdateStatus } from "../../protocol/types";
import { Button } from "@/components/ui/button";
import { StatusRow } from "./StatusRow";
import { updateLabel } from "./updateLabel";

/** Shows an update downloading or ready to install. Renders nothing otherwise. */
export function UpdateStatusLine() {
  const status = useSubscription<UpdateStatus>(api.subscribeUpdateStatus, { state: "none" });
  const [error, setError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);

  const label = updateLabel(status);
  if (!label) {
    return null;
  }

  async function restart() {
    try {
      setError(null);
      setRestarting(true);
      await api.restartToUpdate();
    } catch (e) {
      setError(errorMessage(e));
      setRestarting(false);
    }
  }

  return (
    <StatusRow
      dot={status.state === "ready" ? "bg-success" : "bg-off"}
      error={error}
      action={
        status.state === "ready" && (
          <Button variant="outline" size="xs" onClick={restart} disabled={restarting}>
            {restarting && <RefreshCwIcon className="animate-spin" />}
            {restarting ? "Restarting…" : "Restart"}
          </Button>
        )
      }
    >
      {label}
    </StatusRow>
  );
}
