import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { memo, useCallback, useState } from "react";
import { api, errorMessage } from "../api";
import type { MessageView } from "../protocol/eventStore";
import { segments } from "../protocol/references";
import type { JevAnswers, MiniMe } from "../protocol/types";
import { formatClock, formatSize } from "./format";
import { approvalState } from "./interactive/approval";
import { InteractiveComponent } from "./interactive/InteractiveComponent";
import { Markdown } from "./Markdown";
import { MiniMeAvatar } from "./MiniMeAvatar";
import { MiniMePill } from "./MiniMePill";
import { TextComponentChip } from "./TextComponentChip";
import { useMiniMes } from "./useMiniMes";
import { WorkflowProgress, showsProgress } from "./WorkflowProgress";

const STATUS_LABEL: Record<string, string | undefined> = {
  streaming: "Replying…",
  paused: "Waiting for your approval",
  cancelled: "Stopped",
  failed: "Failed",
};

interface Props {
  projectId: string;
  message: MessageView;
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
export const MessageItem = memo(function MessageItem({ projectId, message }: Props) {
  const [error, setError] = useState<string | null>(null);
  const miniMes = useMiniMes();
  const { name, miniMe: authorMiniMe } = author(message, miniMes);

  const counts = new Map<string, number>();
  for (const reaction of message.reactions) {
    counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
  }
  const miniMe = (id: string) => miniMes.find((m) => m.id === id);
  const reactors = (emoji: string) => message.reactions.filter((r) => r.emoji === emoji);
  // An approval shows only while it asks; once answered, the progress card shows its answer.
  const shown = message.components.filter(
    (c) => c.kind !== "approval" || approvalState(c.answer, message.status) === "asking",
  );

  const open = useCallback(
    async (assetId: string) => {
      try {
        await api.openAsset(projectId, assetId);
      } catch (e) {
        setError(errorMessage(e));
      }
    },
    [projectId],
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
        <Badge
          key={asset.id}
          variant="secondary"
          className="cursor-pointer"
          render={<button onClick={() => open(asset.id)} />}
        >
          {asset.name} · {formatSize(asset.size_bytes)}
        </Badge>
      ))}
    </div>
  );

  // A white pill per emoji over the bubble's bottom-left corner, with the avatars of the
  // Mini-Mes that reacted with it; the tooltip names every reactor.
  const reactionPills = counts.size > 0 && (
    <ul aria-label="Reactions" className="pointer-events-none absolute -bottom-3 left-3 flex gap-1">
      {[...counts].map(([emoji, count]) => {
        const byMiniMes = reactors(emoji).filter((r) => r.by.kind === "mini_me");
        return (
          <li key={emoji} className="pointer-events-auto">
            <Tooltip>
              <TooltipTrigger
                render={<span />}
                className="flex h-6 items-center gap-1 rounded-full border border-border bg-card px-1.5 text-meta shadow-xs"
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

  const notes = (
    <>
      {message.jev && (
        <JevAnswersBlock jev={message.jev} label={(id) => miniMe(id)?.name ?? id} />
      )}
      {message.failure && (
        <p className="text-meta text-destructive">{message.failure.message}</p>
      )}
      {error && <p className="text-meta text-destructive">{error}</p>}
    </>
  );

  if (fromUser) {
    return (
      <article className="flex max-w-[560px] flex-col items-end gap-1.5 self-end">
        <div className="relative flex flex-col gap-2 rounded-[14px_14px_4px_14px] border border-border bg-card px-4 py-3">
          {text}
          {attachments}
          {reactionPills}
        </div>
        <p className={cn("text-meta text-muted-foreground", counts.size > 0 && "mt-2")}>
          {name} · {time}
        </p>
        {notes}
      </article>
    );
  }

  return (
    <article className="relative flex flex-col gap-2 text-ink-2">
      <header className="flex items-center gap-2 text-meta">
        <MiniMeAvatar miniMe={authorMiniMe} size={26} />
        <strong className="text-[14.5px] font-semibold text-foreground">{name}</strong>
        <span className="text-muted-foreground">{time}</span>
        {status && (
          <span className={message.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
            {status}
          </span>
        )}
      </header>
      {showsProgress(message.steps) && (
        <WorkflowProgress
          steps={message.steps}
          components={message.components}
          replyStatus={message.status}
          color={authorMiniMe?.colors.solid}
        />
      )}
      {message.author.kind === "mini_me" ? (
        <Markdown
          content={message.content}
          textComponents={message.text_components}
          miniMes={miniMes}
          onOpenAsset={open}
        />
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
          {message.progress.fraction !== null && ` · ${Math.round(message.progress.fraction * 100)}%`}
        </p>
      )}
      {attachments}
      {reactionPills}
      {notes}
    </article>
  );
});

/** Jev's raw answers, for the "Show Jev's answers" developer setting. */
function JevAnswersBlock({ jev, label }: { jev: JevAnswers; label: (option: string) => string }) {
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  return (
    <details className="text-meta text-muted-foreground">
      <summary className="cursor-pointer select-none">[DEBUG] Jev</summary>
      {jev.error && (
        <p className="mt-1">
          {jev.error.code}: {jev.error.message}
        </p>
      )}
      {jev.answers &&
        Object.entries(jev.answers).map(([question, answer]) => (
          <p key={question} className="mt-1 font-mono wrap-anywhere">
            {question}: {label(answer.choice)} ({percent(answer.confidence)}) ·{" "}
            {Object.entries(answer.probabilities)
              .sort(([, a], [, b]) => b - a)
              .map(([option, p]) => `${label(option)} ${percent(p)}`)
              .join(", ")}
          </p>
        ))}
    </details>
  );
}
