import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { memo, useCallback, useState } from "react";
import { errorMessage } from "../../api";
import type { MessageView, Reaction } from "../../protocol/eventStore";
import { segments } from "../../protocol/references";
import type { AssetRef, MiniMe } from "../../protocol/types";
import { formatClock, formatSize } from "../../lib/format";
import { approvalState } from "../interactive/approval";
import { InteractiveComponent } from "../interactive/InteractiveComponent";
import { JevDebugBlock } from "./JevDebugBlock";
import { ReplyDebugBlock } from "./ReplyDebugBlock";
import { Markdown } from "./Markdown";
import { MiniMeAvatar } from "../minime/MiniMeAvatar";
import { MiniMePill } from "../minime/MiniMePill";
import { MiniMeSurface } from "../minime/MiniMeSurface";
import { ReferenceChip } from "./ReferenceChip";
import { useFileExists } from "./existingFiles";
import { TextComponentChip } from "./TextComponentChip";
import { useDeveloperMode } from "../../hooks/useDeveloperMode";
import { useJevDebug } from "../../hooks/useJevDebug";
import { useReplyDebug } from "../../hooks/useReplyDebug";
import { useMiniMes } from "../../hooks/useMiniMes";
import { useOpenFile } from "../documents/openDocument";
import { isDocument } from "../files/files";
import { WorkflowProgress, componentPlaces, showsProgress } from "./WorkflowProgress";
import { MetaParts } from "@/components/ui/meta-parts";

const STATUS_LABEL: Record<string, string | undefined> = {
  streaming: "Replying…",
  paused: "Waiting for your approval",
  cancelled: "Stopped",
  failed: "Failed",
};

interface Props {
  projectId: string;
  message: MessageView;
  /** Opens or closes this reply's Workflow steps beside the Conversation. */
  onToggleSteps?: (messageId: string) => void;
  /** Whether those steps are open. */
  stepsShown?: boolean;
  /** In a comment thread's card: the user's comments without a bubble, and smaller replies. */
  compact?: boolean;
}

/** The author's name, and the Mini-Me when the author is a known one. */
function author(message: MessageView, miniMes: MiniMe[]): { name: string; miniMe?: MiniMe } {
  switch (message.author.kind) {
    case "user":
      return { name: "You" };
    case "system":
      return { name: message.author.id === "routing" ? "Mini-Me" : "System" };
    default: {
      const miniMe = miniMes.find((m) => m.id === message.author.id);
      return miniMe ? { name: miniMe.name, miniMe } : { name: "Mini-Me" };
    }
  }
}

// Memoised: the Conversation's state keeps each unchanged message the same object, so only
// the messages an event changed render again.
export const MessageItem = memo(function MessageItem({
  projectId,
  message,
  onToggleSteps,
  stepsShown = false,
  compact = false,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const miniMes = useMiniMes();
  const developer = useDeveloperMode();
  const jevDebug = useJevDebug();
  const replyDebug = useReplyDebug();
  const { name, miniMe: authorMiniMe } = author(message, miniMes);

  const miniMe = (id: string) => miniMes.find((m) => m.id === id);
  const { own } = componentPlaces(message.steps, message.components, message.status);
  // An approval shows only while it asks; once answered, the progress card shows its answer.
  const shown = own.filter(
    (c) => c.kind !== "approval" || approvalState(c.answer, message.status) === "asking",
  );

  const openFile = useOpenFile(projectId, { onError: (e) => setError(errorMessage(e)) });
  const open = useCallback(
    (assetId: string) => {
      const name = message.attachments.find((a) => a.id === assetId)?.name;
      openFile(assetId, !!name && isDocument(name));
    },
    [message.attachments, openFile],
  );

  const status = STATUS_LABEL[message.status];
  const fromUser = message.author.kind === "user";
  const time = formatClock(message.created_at);

  const text = (
    <p className="text-body whitespace-pre-wrap wrap-anywhere">
      {segments(message.content, message.text_components).map((segment, index) =>
        segment.component ? (
          <TextComponentChip
            key={index}
            component={segment.component}
            miniMes={miniMes}
            onOpenAsset={open}
          >
            {segment.text}
          </TextComponentChip>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </p>
  );

  const attachments = message.attachments.length > 0 && (
    <div className="flex flex-wrap gap-1.5">
      {message.attachments.map((asset) => (
        <AttachmentChip key={asset.id} asset={asset} onOpen={() => open(asset.id)} />
      ))}
    </div>
  );

  const notes = (
    <>
      {fromUser && !compact && developer && (jevDebug.answers || jevDebug.asked) && (
        <JevDebugBlock
          projectId={projectId}
          messageId={message.id}
          miniMeName={(id) => miniMe(id)?.name}
        />
      )}
      {message.failure && (
        <p className="text-meta text-destructive">{message.failure.message}</p>
      )}
      {error && <p className="text-meta text-destructive">{error}</p>}
    </>
  );

  if (fromUser && compact) {
    return (
      <article data-message-id={message.id} className="flex flex-col gap-1">
        <p className="text-meta text-muted-foreground">
          <MetaParts parts={[name, time]} />
        </p>
        {text}
        {attachments}
        {notes}
      </article>
    );
  }

  if (fromUser) {
    return (
      <article data-message-id={message.id} className="flex max-w-[520px] flex-col items-end gap-1.5 self-end">
        <div className="relative flex flex-col gap-2 rounded-[14px_14px_4px_14px] bg-bubble [--card-edge:transparent] px-[15px] py-[11px] text-foreground">
          {text}
          {attachments}
          <ReactionPills reactions={message.reactions} miniMe={miniMe} />
        </div>
        <p className={cn("text-meta text-muted-foreground", message.reactions.length > 0 && "mt-2")}>{time}</p>
        {notes}
      </article>
    );
  }

  const debugged =
    !compact &&
    developer &&
    (replyDebug.reply_input || replyDebug.reply_details || replyDebug.reply_tools);

  return (
    <div className="flex flex-col gap-1.5">
      <MiniMeSurface
        miniMe={authorMiniMe}
        render={<article />}
        data-message-id={message.id}
        className={cn(
          "relative flex flex-col text-foreground",
          compact ? "gap-2.5 px-3 py-2.5" : "gap-3.5 px-[18px] py-4",
        )}
      >
        <header className="flex items-center gap-[9px] text-meta">
          <MiniMeAvatar miniMe={authorMiniMe} size={compact ? 20 : 28} />
          <strong className="font-serif text-name font-medium text-foreground">{name}</strong>
          <span className="text-mm-ink">
            <MetaParts parts={[time, message.status !== "failed" && status]} />
          </span>
          {message.status === "failed" && <span className="text-destructive">{status}</span>}
        </header>
        {showsProgress(message.steps) && (
          <WorkflowProgress
            steps={message.steps}
            components={message.components}
            messageId={message.id}
            replyStatus={message.status}
            color={authorMiniMe?.colors.solid}
            onShowSteps={onToggleSteps && (() => onToggleSteps(message.id))}
            stepsShown={stepsShown}
          />
        )}
        {/* A reply with no text yet, or none at all, leaves no empty block to space around. */}
        {message.author.kind === "mini_me" ? (
          message.content.trim() !== "" && (
            <Markdown
              content={message.content}
              textComponents={message.text_components}
              miniMes={miniMes}
              onOpenAsset={open}
            />
          )
        ) : (
          text
        )}
        {shown.length > 0 && (
          <div className="flex min-w-0 flex-col gap-3">
            {shown.map((component) => (
              <InteractiveComponent
                key={component.id}
                component={component}
                projectId={projectId}
                messageId={message.id}
                replyStatus={message.status}
                color={authorMiniMe?.colors.solid}
              />
            ))}
          </div>
        )}
        {message.status === "streaming" && message.progress && (
          <p role="status" className="text-meta text-muted-foreground">
            {message.progress.label}
            {message.progress.fraction !== null && ` (${Math.round(message.progress.fraction * 100)}%)`}
          </p>
        )}
        {attachments}
        <ReactionPills reactions={message.reactions} miniMe={miniMe} />
        {notes}
      </MiniMeSurface>
      {/* Outside the reply's colours, where it reads as a developer note, not part of the reply. */}
      {debugged && <ReplyDebugBlock projectId={projectId} messageId={message.id} />}
    </div>
  );
});

function ReactionPills({
  reactions,
  miniMe,
}: {
  reactions: Reaction[];
  miniMe: (id: string) => MiniMe | undefined;
}) {
  const counts = new Map<string, number>();
  for (const reaction of reactions) {
    counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
  }
  const reactors = (emoji: string) => reactions.filter((r) => r.emoji === emoji);
  if (counts.size === 0) return null;
  return (
    <ul aria-label="Reactions" className="pointer-events-none absolute -bottom-3 left-3 flex gap-1">
      {[...counts].map(([emoji, count]) => {
        const byMiniMes = reactors(emoji).filter((r) => r.by.kind === "mini_me");
        return (
          <li key={emoji} className="pointer-events-auto">
            <Tooltip>
              <TooltipTrigger
                render={<span />}
                className="flex h-6 items-center gap-1 rounded-full border border-border bg-card px-1.5 text-meta"
              >
                {byMiniMes.slice(0, 3).map((reaction, index) => (
                  <MiniMeAvatar
                    key={index}
                    miniMe={miniMe(reaction.by.id)}
                    size={16}
                    className={index > 0 ? "-ml-2" : undefined}
                  />
                ))}
                {emoji}
                {count > 1 && ` ${count}`}
              </TooltipTrigger>
              <TooltipContent>
                {reactors(emoji).map((reaction, index) =>
                  reaction.by.kind === "mini_me" ? (
                    <MiniMePill key={index} miniMe={miniMe(reaction.by.id)}>
                      {miniMe(reaction.by.id)?.name ?? "Mini-Me"}
                    </MiniMePill>
                  ) : (
                    <span key={index}>You</span>
                  ),
                )}
              </TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

/** A file attached to a message: it opens the file, or says that the file was removed. */
function AttachmentChip({ asset, onOpen }: { asset: AssetRef; onOpen: () => void }) {
  if (!useFileExists(asset.id)) {
    return (
      <ReferenceChip title="This file was deleted" className="text-muted-foreground">
        {asset.name} (Deleted)
      </ReferenceChip>
    );
  }
  return (
    <ReferenceChip title="Open file" onOpen={onOpen}>
      {asset.name} ({formatSize(asset.size_bytes)})
    </ReferenceChip>
  );
}
