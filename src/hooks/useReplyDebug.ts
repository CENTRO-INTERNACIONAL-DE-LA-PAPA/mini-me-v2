import { api } from "../api";
import type { ReplyDebugSettings } from "../protocol/types";
import { sharedValue } from "./sharedValue";

const replyDebug = sharedValue<ReplyDebugSettings>(
  () => api.getAiSettings().then((s) => s.debug),
  { reply_input: false, reply_details: false, reply_tools: false },
);

/** The reply debug settings; all off until they have loaded. */
export const useReplyDebug = replyDebug.use;

/** Shows `settings` wherever `useReplyDebug` is used. */
export const refreshReplyDebug = replyDebug.show;
