import { useMiniMes } from "../../hooks/useMiniMes";
import { statusLabel } from "../../lib/conversationStatus";
import type { ConversationStatus } from "../../protocol/types";
import { MiniMeAvatar } from "../minime/MiniMeAvatar";

/** The sidebar line under a Conversation while its reply runs or waits: the Mini-Me's avatar and
 * what it does, in its colours; a Mini-Me the library no longer holds is drawn neutral. */
export function ConversationStatusLine({ status }: { status: ConversationStatus }) {
  const miniMe = useMiniMes().find((m) => m.id === status.mini_me.id);
  return (
    <span className="flex w-full items-center gap-1.5 text-meta font-normal">
      {/* Menu buttons size every svg as an icon; avatar bodies are svgs that fill their box. */}
      <span className="flex size-4 shrink-0 [&_svg]:size-full!">
        <MiniMeAvatar miniMe={miniMe} size={16} working={status.kind === "running"} />
      </span>
      <span
        className="truncate text-muted-foreground"
        style={miniMe ? { color: miniMe.colors.ink } : undefined}
      >
        {statusLabel(status)}
      </span>
    </span>
  );
}
