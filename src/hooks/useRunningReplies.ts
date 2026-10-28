import { useEffect, useState } from "react";
import { api } from "../api";
import type { RunningReply } from "../protocol/types";

// One subscription for the whole app; components listen to its latest list.
let latest: RunningReply[] = [];
let subscribed = false;
const listeners = new Set<(running: RunningReply[]) => void>();

function subscribe() {
  if (subscribed) return;
  subscribed = true;
  api
    .subscribeRunningReplies((running) => {
      latest = running;
      listeners.forEach((update) => update(running));
    })
    .catch(() => {
      subscribed = false;
    });
}

/** Every reply whose Mini-Me run is in flight, in any Project, kept up to date. */
export function useRunningReplies(): RunningReply[] {
  const [running, setRunning] = useState(latest);

  useEffect(() => {
    listeners.add(setRunning);
    setRunning(latest);
    subscribe();
    return () => {
      listeners.delete(setRunning);
    };
  }, []);

  return running;
}
