import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { MessageStatus, RunningReply, Uuid } from "../protocol/types";
import { useRunningReplies } from "./useRunningReplies";

/** What the notification for a reply that stopped running says, or null when it needs none, as
 * for a reply the user cancelled. */
export function replyNotice(
  reply: RunningReply,
  status: MessageStatus | null,
): { title: string; body: string } | null {
  const name = reply.mini_me.name;
  const body =
    status === "complete"
      ? `${name} replied`
      : status === "failed"
        ? `${name}'s reply failed`
        : status === "paused"
          ? `${name} needs your approval`
          : null;
  return body ? { title: reply.conversation_title, body } : null;
}

/** Sends a desktop notification when a reply finishes, fails or pauses for an approval out of
 * view: while the window is not focused, or its Conversation is not `open`. Returns the
 * Conversations whose reply stopped while they were not open, until each is opened. */
export function useReplyNotifications(open: Uuid | null): ReadonlySet<Uuid> {
  const running = useRunningReplies();
  const previous = useRef(running);
  // Read when a reply stops, which happens apart from renders.
  const openNow = useRef(open);
  openNow.current = open;
  const [unseen, setUnseen] = useState<ReadonlySet<Uuid>>(new Set());

  useEffect(() => {
    const still = new Set(running.map((r) => r.message_id));
    const stopped = previous.current.filter((r) => !still.has(r.message_id));
    previous.current = running;
    for (const reply of stopped) void notify(reply);
  }, [running]);

  useEffect(() => {
    if (!open) return;
    setUnseen((current) => {
      if (!current.has(open)) return current;
      const rest = new Set(current);
      rest.delete(open);
      return rest;
    });
  }, [open]);

  async function notify(reply: RunningReply) {
    const here = reply.conversation_id === openNow.current;
    if (here && document.hasFocus()) return;
    const status = await api.getMessageStatus(reply.project_id, reply.message_id).catch(() => null);
    const notice = replyNotice(reply, status);
    if (!notice) return;
    if (!here) setUnseen((current) => new Set(current).add(reply.conversation_id));
    if (await allowed()) sendNotification(notice);
  }

  return unseen;
}

/** Whether the app may notify, asking the system the first time. */
async function allowed(): Promise<boolean> {
  if (await isPermissionGranted()) return true;
  return (await requestPermission()) === "granted";
}
