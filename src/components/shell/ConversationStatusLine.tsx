import { useMiniMes } from "../../hooks/useMiniMes";
import { statusLabel } from "../../lib/conversationStatus";
import type { ConversationStatus } from "../../protocol/types";
import { MiniMeAvatar } from "../minime/MiniMeAvatar";

/** The line under a Conversation in the sidebar while its latest reply is running or waits: the
 * working Mini-Me's avatar and what it is doing, in its colours. A Mini-Me the library no longer
 * holds gets the neutral avatar and the neutral text colour. */
export function ConversationStatusLine({ status }: { status: ConversationStatus }) {
  const miniMe = useMiniMes().find((m) => m.id === status.mini_me.id);
  return (
    <span className="flex w-full items-center gap-1.5 text-meta font-normal">
      {/* Menu buttons size every svg as an icon; avatar bodies are svgs that fill their box. */}
      <span className="flex size-4 shrink-0 [&_svg]:size-full!">
        <MiniMeAvatar miniMe={miniMe} size={16} />
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
