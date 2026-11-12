import { api } from "../../api";
import { useSubscription } from "../../hooks/useSubscription";
import { StatusRow } from "./StatusRow";

/** Says why Mini-Mes are not chosen automatically. Renders nothing while Jev chooses them. */
export function RoutingWarningLine() {
  const warning = useSubscription(api.subscribeRoutingWarning, null);

  if (!warning) {
    return null;
  }

  return <StatusRow>{warning}</StatusRow>;
}
