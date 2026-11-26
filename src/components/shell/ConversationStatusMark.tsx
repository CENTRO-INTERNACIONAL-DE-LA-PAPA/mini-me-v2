import { useMiniMes } from "../../hooks/useMiniMes";
import type { ConversationStatus } from "../../protocol/types";
import { MiniMeAvatar } from "../minime/MiniMeAvatar";

/** A Conversation's Mini-Me while its reply runs or waits; neutral for a removed Mini-Me. */
export function ConversationStatusMark({ status }: { status: ConversationStatus }) {
  const miniMe = useMiniMes().find((m) => m.id === status.mini_me.id);
  return (
    // Menu buttons size every svg as an icon; avatar bodies are svgs that fill their box.
    <span className="flex size-5.5 shrink-0 [&_svg]:size-full!">
      <MiniMeAvatar miniMe={miniMe} size={22} working={status.kind === "running"} />
    </span>
  );
}
