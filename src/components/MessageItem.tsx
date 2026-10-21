import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { memo, useCallback, useState } from "react";
import { api, errorMessage } from "../api";
import type { MessageView } from "../protocol/eventStore";
import { segments } from "../protocol/references";
import type { JevAnswers, MiniMe } from "../protocol/types";
import { formatSize } from "./format";
import { InteractiveComponent } from "./interactive/InteractiveComponent";
import { Markdown } from "./Markdown";
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

  return (
    <article
      className={cn(
        "relative flex flex-col gap-2",
        fromUser
          ? "max-w-[560px] self-end rounded-[14px_14px_4px_14px] border border-border bg-card px-4 py-3"
          : "text-ink-2",
      )}
    >
      <header className="flex items-baseline gap-2 text-meta">
        {message.author.kind !== "user" && (
          <span
            aria-hidden
            className={cn(
              "size-[9px] shrink-0 self-center rounded-full",
              !authorMiniMe && "bg-off",
            )}
            style={authorMiniMe && { backgroundColor: authorMiniMe.colors.solid }}
          />
        )}
        <strong className="text-[14.5px] font-semibold text-foreground">{name}</strong>
        {status && (
          <span className={message.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
            {status}
          </span>
        )}
      </header>
      {showsProgress(message.steps) && (
        <WorkflowProgress
          steps={message.steps}
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
      )}
      {message.components.length > 0 && (
        <div className="flex min-w-0 flex-col gap-3">
          {message.components.map((component) => (
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
      {message.attachments.length > 0 && (
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
      )}
      {counts.size > 0 && (
        <ul
          aria-label="Reactions"
          className="pointer-events-none absolute -bottom-3 right-3 flex gap-1"
        >
          {[...counts].map(([emoji, count]) => (
            <li key={emoji} className="pointer-events-auto">
              <Tooltip>
                <TooltipTrigger
                  render={<span />}
                  className={cn(
                    "block rounded-full border border-border bg-card px-1.5 text-meta leading-5",
                    "shadow-xs",
                  )}
                >
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
          ))}
        </ul>
      )}
      {message.jev && (
        <JevAnswersBlock jev={message.jev} label={(id) => miniMe(id)?.name ?? id} />
      )}
      {message.failure && (
        <p className="text-meta text-destructive">{message.failure.message}</p>
      )}
      {error && <p className="text-meta text-destructive">{error}</p>}
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
