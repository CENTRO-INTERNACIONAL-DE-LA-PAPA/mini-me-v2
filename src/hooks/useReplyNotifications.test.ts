import { describe, expect, it } from "vitest";
import type { RunningReply } from "../protocol/types";
import { replyNotice } from "./useReplyNotifications";

const reply: RunningReply = {
  project_id: "p",
  conversation_id: "c",
  conversation_title: "Literature",
  message_id: "m",
  mini_me: { id: "t", name: "Theorist" },
};

describe("replyNotice", () => {
  it("says how the reply ended and where", () => {
    expect(replyNotice(reply, "complete")).toEqual({
      title: "Literature",
      body: "Theorist replied",
    });
    expect(replyNotice(reply, "failed")?.body).toBe("Theorist's reply failed");
    expect(replyNotice(reply, "paused")?.body).toBe("Theorist needs your approval");
  });

  it("stays quiet for a cancelled or missing reply", () => {
    expect(replyNotice(reply, "cancelled")).toBeNull();
    expect(replyNotice(reply, null)).toBeNull();
  });
});
